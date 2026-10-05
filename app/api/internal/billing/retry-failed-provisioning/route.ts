import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { provisionAvatarStorageSubscription, retryLegacyAvatarSubscription } from "@/lib/stripe/avatar-billing";
import { processCheckoutDraftLifecycle } from "@/lib/checkout/process-draft-lifecycle";

// Cron-triggered (see vercel.json), and deliberately bundles two unrelated
// daily billing tasks in one handler: Vercel's Hobby plan caps this project
// at 2 scheduled cron jobs, and both slots are already spoken for (this one
// plus /api/internal/videos/refresh-expired-urls), so a third daily task
// gets folded into whichever existing cron fits best thematically rather
// than requesting a third schedule.
//
// Task 1 — re-attempt of any AVATAR_STORAGE rows that failed to provision.
// Uses the same avatar-storage-${avatarId} idempotency key as the original
// attempt, so a retry after a Stripe-side success (e.g. the create actually
// went through but our response handling failed) never creates a second
// real subscription. Branches on the enterprise's provisioningMode: a
// SELF_SERVE row retries through the normal Phase 2 path (which re-resolves
// its customer from the STANDARD-plan subscription); a SALES_ASSISTED/
// legacy row (from the avatar-billing-setup Checkout flow) has no such
// STANDARD row to resolve from, so it retries using the stripeCustomerId
// already recorded on the failed row itself instead.
//
// Task 2 — lib/checkout/process-draft-lifecycle.ts: day-2/day-7 reminder
// emails and 30-day deletion for abandoned guest Mid Market / Small
// Business checkouts. See that file for the actual logic.
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const failed = await prisma.subscription.findMany({
    where: {
      billingComponent: "AVATAR_STORAGE",
      provisioningFailedAt: { not: null },
      avatarId: { not: null },
      enterpriseId: { not: null },
    },
    select: { id: true, avatarId: true, enterpriseId: true, stripeCustomerId: true },
  });

  const results = [];
  for (const row of failed) {
    if (!row.avatarId || !row.enterpriseId) continue;

    const enterprise = await prisma.enterprise.findUnique({
      where: { id: row.enterpriseId },
      select: { provisioningMode: true },
    });

    const result =
      enterprise?.provisioningMode === "SELF_SERVE"
        ? await provisionAvatarStorageSubscription(row.enterpriseId, row.avatarId)
        : row.stripeCustomerId
          ? await retryLegacyAvatarSubscription(row.enterpriseId, row.avatarId, row.stripeCustomerId)
          : { ok: false as const, code: "NO_PAYMENT_METHOD" as const, error: "No stripeCustomerId recorded to retry against." };

    results.push({ subscriptionId: row.id, avatarId: row.avatarId, ok: result.ok });
  }

  const checkoutDraftLifecycle = await processCheckoutDraftLifecycle();

  return NextResponse.json({
    attempted: results.length,
    results,
    checkoutDraftLifecycle,
  });
}
