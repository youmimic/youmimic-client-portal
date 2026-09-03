import type { VideoEngine, PlanType } from "@/app/generated/prisma/enums";

// Credits-per-second-per-engine, in millicredits (credits x 1000, matching
// how UsageLedgerEntry stores credits as an integer). Deliberately a
// separate table from lib/heygen/pricing.ts's ENGINE_RATE_USD_PER_SECOND —
// credits are an internal, product-defined unit, not a direct mirror of
// real USD cost, so they can diverge later (e.g. a future non-HeyGen engine
// priced differently in credits than in dollars).
//
// PLACEHOLDER: these values just mirror the $/sec rate table x 1000 as a
// starting point. Confirm the real per-engine credit cost with the product
// owner before these numbers are treated as final — see PLAN_CREDIT_LIMITS_MILLI
// below for why that doesn't block shipping the mechanism itself.
export const ENGINE_CREDITS_PER_SECOND_MILLI: Record<VideoEngine, number> = {
  AVATAR_III: 16.7,
  AVATAR_IV: 66.7,
  AVATAR_V: 66.7,
};

// PLACEHOLDER: per-plan monthly credit limits, in millicredits. Set very
// high on purpose — high enough that no real user is ever blocked by a
// made-up number — until the product owner provides real target limits
// (e.g. "20 minutes of Avatar III" was discussed only as an illustrative
// example, not a confirmed figure). Lower these once real numbers exist;
// no other code needs to change when that happens.
const PLACEHOLDER_HIGH_LIMIT_MILLI = 1_000_000_000; // effectively unlimited for now

export const PLAN_CREDIT_LIMITS_MILLI: Record<PlanType, number> = {
  // No live path to Avatar Studio exists on a bare FREE plan today (access
  // is gated by userHasActiveSubscription, which requires an ACTIVE/
  // TRIALING Subscription row) — 0 here is a defensive default, not
  // expected to be hit in practice.
  FREE: 0,
  CREATOR: PLACEHOLDER_HIGH_LIMIT_MILLI,
  ENTERPRISE: PLACEHOLDER_HIGH_LIMIT_MILLI,
};

export function creditsForDurationMilli(engine: VideoEngine, durationSeconds: number): number {
  return Math.round(ENGINE_CREDITS_PER_SECOND_MILLI[engine] * durationSeconds);
}
