import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { PlanType, UsageLedgerStatus } from "@/app/generated/prisma/enums";
import type { VideoEngine } from "@/app/generated/prisma/enums";
import { getApplicableSubscription } from "@/lib/subscription";
import { creditsForDurationMilli, PLAN_CREDIT_LIMITS_MILLI } from "@/lib/heygen/credits";
import { estimateDurationSeconds } from "@/lib/heygen/duration-estimate";

function startOfCalendarMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextCalendarMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export interface BillingPeriod {
  subscriptionId: string | null;
  planType: PlanType;
  periodStart: Date;
  periodEnd: Date;
}

// Resolves which billing period a user's usage should be counted against,
// using the same subscription (personal, or an owned enterprise's) that
// already gates Avatar Studio access via userHasActiveSubscription. Falls
// back to a calendar-month window only for the defensive edge case where no
// applicable subscription exists, or one exists but has no
// currentPeriodStart/End (both nullable in the schema even though the
// live-gated generate path shouldn't normally produce either) — both cases
// are logged since they signal a data gap worth investigating, not a
// normal path.
export async function resolveBillingPeriod(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<BillingPeriod> {
  const subscription = await getApplicableSubscription(userId, tx);
  const now = new Date();

  if (!subscription) {
    console.warn(`resolveBillingPeriod: no applicable subscription for user ${userId} — falling back to calendar month`);
    return {
      subscriptionId: null,
      planType: PlanType.FREE,
      periodStart: startOfCalendarMonth(now),
      periodEnd: startOfNextCalendarMonth(now),
    };
  }

  if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
    return {
      subscriptionId: subscription.id,
      planType: subscription.planType,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    };
  }

  console.warn(
    `resolveBillingPeriod: subscription ${subscription.id} has no currentPeriodStart/End — falling back to calendar month for user ${userId}`,
  );
  return {
    subscriptionId: subscription.id,
    planType: subscription.planType,
    periodStart: startOfCalendarMonth(now),
    periodEnd: startOfNextCalendarMonth(now),
  };
}

async function usedCreditsMilliForPeriod(
  tx: Prisma.TransactionClient,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  // RELEASED entries are excluded entirely (credits given back). RESERVED
  // entries count their reserved estimate (still outstanding); RECONCILED
  // entries count their final charged amount instead, since that's the
  // authoritative figure once known — a single grouped query rather than
  // two separate aggregates.
  const grouped = await tx.usageLedgerEntry.groupBy({
    by: ["status"],
    where: {
      userId,
      periodStart,
      periodEnd,
      status: { in: [UsageLedgerStatus.RESERVED, UsageLedgerStatus.RECONCILED] },
    },
    _sum: { creditsReservedMilli: true, creditsChargedMilli: true },
  });

  let usedMilli = 0;
  for (const group of grouped) {
    if (group.status === UsageLedgerStatus.RESERVED) {
      usedMilli += group._sum.creditsReservedMilli ?? 0;
    } else if (group.status === UsageLedgerStatus.RECONCILED) {
      usedMilli += group._sum.creditsChargedMilli ?? 0;
    }
  }
  return usedMilli;
}

export type ReserveCreditsResult =
  | { ok: true; ledgerEntryId: string }
  | {
      ok: false;
      code: "OVER_LIMIT";
      creditsUsedMilli: number;
      creditsLimitMilli: number;
      periodEnd: Date;
    };

// Estimates credits for the given script (HeyGen never reports a duration
// before a video completes — see lib/heygen/duration-estimate.ts), and only
// if that estimate keeps this user's current-period usage under their
// plan's limit, reserves it by inserting a RESERVED ledger row. Runs inside
// the caller's transaction so the sum-then-insert is atomic against a
// concurrent duplicate request (double-click, two tabs) — accepting default
// READ COMMITTED isolation for now rather than serializable/advisory-lock
// machinery not used anywhere else in this codebase; worst case under true
// concurrency is being over by one video's credits for one period, not
// unbounded.
export async function reserveCredits(
  tx: Prisma.TransactionClient,
  params: { userId: string; engine: VideoEngine; script: string },
): Promise<ReserveCreditsResult> {
  const { userId, engine, script } = params;
  const { subscriptionId, planType, periodStart, periodEnd } = await resolveBillingPeriod(tx, userId);

  const limitMilli = PLAN_CREDIT_LIMITS_MILLI[planType];
  const usedMilli = await usedCreditsMilliForPeriod(tx, userId, periodStart, periodEnd);

  const estimatedDurationSeconds = estimateDurationSeconds(script);
  const creditsReservedMilli = creditsForDurationMilli(engine, estimatedDurationSeconds);

  if (usedMilli + creditsReservedMilli > limitMilli) {
    return {
      ok: false,
      code: "OVER_LIMIT",
      creditsUsedMilli: usedMilli,
      creditsLimitMilli: limitMilli,
      periodEnd,
    };
  }

  const entry = await tx.usageLedgerEntry.create({
    data: {
      userId,
      subscriptionId,
      engine,
      status: UsageLedgerStatus.RESERVED,
      estimatedDurationSeconds,
      creditsReservedMilli,
      periodStart,
      periodEnd,
    },
    select: { id: true },
  });

  return { ok: true, ledgerEntryId: entry.id };
}

// Thin wrapper opening its own transaction — what generateAvatarVideo()
// calls. Matches lib/invites/accept-invite.ts's acceptInvite() wrapping
// claimInviteAndCreateMembership().
export async function reserveCreditsForGeneration(params: {
  userId: string;
  engine: VideoEngine;
  script: string;
}): Promise<ReserveCreditsResult> {
  return prisma.$transaction((tx) => reserveCredits(tx, params));
}

// Called when HeyGen's create-video call itself fails after a successful
// reserve — the reservation shouldn't count against the user's period since
// no video was ever generated. Conditional update (only affects a row still
// RESERVED) makes this safe to call even if something else already
// resolved the entry.
export async function releaseReservation(ledgerEntryId: string): Promise<void> {
  await prisma.usageLedgerEntry.updateMany({
    where: { id: ledgerEntryId, status: UsageLedgerStatus.RESERVED },
    data: { status: UsageLedgerStatus.RELEASED, releasedAt: new Date() },
  });
}

// Same as releaseReservation, but looked up by videoId — used when HeyGen
// later reports the render itself FAILED (not a create-call failure, a
// completion-time failure reported via webhook or manual refresh).
export async function releaseReservationForVideo(videoId: string): Promise<void> {
  await prisma.usageLedgerEntry.updateMany({
    where: { videoId, status: UsageLedgerStatus.RESERVED },
    data: { status: UsageLedgerStatus.RELEASED, releasedAt: new Date() },
  });
}

// Called from both refreshGeneratedVideoStatus() and the HeyGen webhook
// route once a video reports COMPLETED — replaces the reserved estimate
// with the real charge. Idempotent (conditional on status still RESERVED)
// since both call sites can re-run on webhook retries / repeated manual
// refreshes, mirroring the lastWebhookEventId dedup guard one layer up.
export async function reconcileCredits(params: {
  videoId: string;
  engine: VideoEngine;
  actualDurationSeconds: number;
}): Promise<void> {
  const { videoId, engine, actualDurationSeconds } = params;
  const creditsChargedMilli = creditsForDurationMilli(engine, actualDurationSeconds);

  await prisma.usageLedgerEntry.updateMany({
    where: { videoId, status: UsageLedgerStatus.RESERVED },
    data: {
      status: UsageLedgerStatus.RECONCILED,
      actualDurationSeconds,
      creditsChargedMilli,
      reconciledAt: new Date(),
    },
  });
}
