import prisma from "@/lib/prisma";
import { BillingComponent, SubscriptionStatus } from "@/app/generated/prisma/enums";
import type { Subscription } from "@/app/generated/prisma/client";

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

type SubscriptionQueryClient = Pick<typeof prisma, "subscription">;

// Lower number = higher priority. STANDARD/PLATFORM_FEE are the
// access-governing rows for an account (the ones whose billing period and
// usage-limit override should actually apply) — AVATAR_STORAGE rows are
// per-avatar add-ons and must never win a tie against them. Matters once an
// account can have more than one simultaneously-active row — e.g. a legacy
// enterprise with one $0 PLATFORM_FEE row plus two $99 AVATAR_STORAGE rows,
// each on its own Stripe billing date.
const BILLING_COMPONENT_PRIORITY: Record<BillingComponent, number> = {
  [BillingComponent.STANDARD]: 0,
  [BillingComponent.PLATFORM_FEE]: 0,
  [BillingComponent.AVATAR_STORAGE]: 1,
};

// Deterministic pick among several simultaneously-active rows: highest
// priority first, then newest first, then id as a final, always-distinct
// tiebreak. Never an arbitrary/DB-order-dependent choice.
function pickApplicable(subs: Subscription[]): Subscription | null {
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) => {
    const priorityDiff = BILLING_COMPONENT_PRIORITY[a.billingComponent] - BILLING_COMPONENT_PRIORITY[b.billingComponent];
    if (priorityDiff !== 0) return priorityDiff;
    const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

// Returns the single active Subscription row that applies to this user — the
// user's own personal subscription (CREATOR plan), or the subscription on an
// enterprise they own (ENTERPRISE plan). Enterprise subscriptions have
// userId=null and enterpriseId set, so they cannot be found by userId alone
// — the enterprise owner relationship is checked separately.
//
// Deliberately NOT filtered to billingComponent: STANDARD — an enterprise
// with only a PLATFORM_FEE or AVATAR_STORAGE row (Phase 1 avatar billing) is
// still a real, active paying customer and should unlock gated features the
// same as a STANDARD plan subscription would.
//
// When more than one row is simultaneously active for the same user/
// enterprise, pickApplicable (above) decides deterministically which one
// governs — previously this was an unordered findFirst, fine when at most
// one row was ever active at once, but not once an account can genuinely
// have several (see BILLING_COMPONENT_PRIORITY's comment).
//
// Note: this only resolves a subscription for the user themselves or an
// enterprise they *own* — an enterprise member who isn't the owner has no
// applicable subscription here. That matches every existing caller's actual
// access-control needs; there's no live path today where a non-owner member
// reaches code gated by this function.
export async function getApplicableSubscription(
  userId: string,
  client: SubscriptionQueryClient = prisma,
): Promise<Subscription | null> {
  const personalSubs = await client.subscription.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
  });
  const personalSub = pickApplicable(personalSubs);
  if (personalSub) return personalSub;

  const enterpriseSubs = await client.subscription.findMany({
    where: {
      enterprise: { ownerUserId: userId },
      status: { in: ACTIVE_STATUSES },
    },
  });
  return pickApplicable(enterpriseSubs);
}

export async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getApplicableSubscription(userId);
  return subscription !== null;
}
