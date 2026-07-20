import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewSubscriptions } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";

const SUBSCRIPTION_DETAIL_SELECT = {
  id: true,
  stripeSubscriptionId: true,
  stripeCustomerId: true,
  stripePriceId: true,
  stripeProductId: true,
  planType: true,
  status: true,
  ownerType: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  canceledAt: true,
  trialEndsAt: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  enterpriseId: true,
  user: { select: { id: true, name: true, email: true, stripeEmail: true } },
  enterprise: {
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  },
  payments: {
    select: {
      id: true,
      type: true,
      status: true,
      amount: true,
      currency: true,
      stripeInvoiceId: true,
      stripePaymentIntentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.SubscriptionSelect;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewSubscriptions(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: SUBSCRIPTION_DETAIL_SELECT,
  });

  if (!subscription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // No write action has ever run against a subscription yet (v1 is
  // read-only — see lib/admin/audit.ts), so this will always return empty
  // today. Queried anyway so the detail page is already correct once a
  // sync/cancel action exists.
  const auditLog = await prisma.adminLog.findMany({
    where: { entityType: ENTITY_TYPES.SUBSCRIPTION, entityId: subscription.id },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  return NextResponse.json({
    id: subscription.id,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripeCustomerId: subscription.stripeCustomerId,
    stripePriceId: subscription.stripePriceId,
    stripeProductId: subscription.stripeProductId,
    planType: subscription.planType,
    status: subscription.status,
    ownerType: subscription.ownerType,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
    user: subscription.user,
    enterprise: subscription.enterprise,
    payments: subscription.payments.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    auditLog: auditLog.map((log) => ({
      id: log.id,
      action: log.action,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
      adminUser: log.adminUser,
    })),
  });
}
