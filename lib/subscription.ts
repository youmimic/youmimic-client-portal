import prisma from "@/lib/prisma";
import { SubscriptionStatus } from "@/app/generated/prisma/enums";

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

export async function userHasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  return sub !== null;
}
