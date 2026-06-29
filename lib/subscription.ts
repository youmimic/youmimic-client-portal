import prisma from "@/lib/prisma";
import { SubscriptionStatus } from "@/app/generated/prisma/enums";

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

// Returns true if the user has a personal active subscription (CREATOR plan)
// OR if the user owns an enterprise that has an active subscription (ENTERPRISE plan).
// Enterprise subscriptions have userId=null and enterpriseId set, so they cannot
// be found by userId alone — we also check the enterprise owner relationship.
export async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const personalSub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (personalSub) return true;

  const enterpriseSub = await prisma.subscription.findFirst({
    where: {
      enterprise: { ownerUserId: userId },
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
  });
  return enterpriseSub !== null;
}
