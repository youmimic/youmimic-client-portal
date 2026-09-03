import prisma from "@/lib/prisma";
import { SubscriptionStatus } from "@/app/generated/prisma/enums";
import type { Subscription } from "@/app/generated/prisma/client";

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

type SubscriptionQueryClient = Pick<typeof prisma, "subscription">;

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
// Note: this only resolves a subscription for the user themselves or an
// enterprise they *own* — an enterprise member who isn't the owner has no
// applicable subscription here. That matches every existing caller's actual
// access-control needs; there's no live path today where a non-owner member
// reaches code gated by this function.
export async function getApplicableSubscription(
  userId: string,
  client: SubscriptionQueryClient = prisma,
): Promise<Subscription | null> {
  const personalSub = await client.subscription.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
  });
  if (personalSub) return personalSub;

  return client.subscription.findFirst({
    where: {
      enterprise: { ownerUserId: userId },
      status: { in: ACTIVE_STATUSES },
    },
  });
}

export async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getApplicableSubscription(userId);
  return subscription !== null;
}
