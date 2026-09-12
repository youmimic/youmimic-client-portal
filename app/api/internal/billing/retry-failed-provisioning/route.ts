import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { provisionAvatarStorageSubscription } from "@/lib/stripe/avatar-billing";
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
// real subscription.
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
    select: { id: true, avatarId: true, enterpriseId: true },
  });

  const results = [];
  for (const row of failed) {
    if (!row.avatarId || !row.enterpriseId) continue;
    const result = await provisionAvatarStorageSubscription(row.enterpriseId, row.avatarId);
    results.push({ subscriptionId: row.id, avatarId: row.avatarId, ok: result.ok });
  }

  const checkoutDraftLifecycle = await processCheckoutDraftLifecycle();

  return NextResponse.json({
    attempted: results.length,
    results,
    checkoutDraftLifecycle,
  });
}
