import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { provisionAvatarStorageSubscription } from "@/lib/stripe/avatar-billing";

// Cron-triggered (see vercel.json) re-attempt of any AVATAR_STORAGE rows that
// failed to provision. Uses the same avatar-storage-${avatarId} idempotency
// key as the original attempt, so a retry after a Stripe-side success (e.g.
// the create actually went through but our response handling failed) never
// creates a second real subscription.
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

  return NextResponse.json({ attempted: results.length, results });
}
