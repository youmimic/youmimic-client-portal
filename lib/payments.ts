import prisma from "@/lib/prisma";

// Personal plan payments (subscription.userId = userId) plus enterprise plan
// payments where this user is the enterprise owner. Non-owner enterprise
// members are excluded because ownerUserId never matches a member's userId.
// Shared by the billing page's "Recent Payments" summary and the full
// payment-history page so the ownership scoping can never drift between them.
export async function fetchPaymentsForUser(userId: string, limit: number) {
  return prisma.payment.findMany({
    where: {
      OR: [
        { subscription: { userId } },
        { subscription: { enterprise: { ownerUserId: userId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      createdAt: true,
      stripeInvoiceId: true,
      subscription: {
        select: {
          enterprise: {
            select: { name: true },
          },
        },
      },
    },
  });
}

export type PaymentRecord = Awaited<ReturnType<typeof fetchPaymentsForUser>>[number];
