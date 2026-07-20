import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type {
  AdminRole,
  BillingOwnerType,
  PlanType,
  Prisma,
  SubscriptionStatus,
} from "@/app/generated/prisma/client";
import { canViewSubscriptions } from "@/lib/admin/rbac";
import { listSubscriptionsQuerySchema } from "@/lib/validations/admin";

const SUBSCRIPTION_LIST_SELECT = {
  id: true,
  stripeSubscriptionId: true,
  stripeCustomerId: true,
  planType: true,
  status: true,
  ownerType: true,
  currentPeriodEnd: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  enterprise: {
    select: {
      id: true,
      name: true,
      owner: { select: { email: true } },
    },
  },
} satisfies Prisma.SubscriptionSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewSubscriptions(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listSubscriptionsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { page, pageSize, search, status, planType, ownerType, sortBy, sortOrder } =
    parsed.data;

  const where: Prisma.SubscriptionWhereInput = {};

  if (search) {
    where.OR = [
      { stripeSubscriptionId: { contains: search, mode: "insensitive" } },
      { stripeCustomerId: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { enterprise: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (status !== "all") {
    where.status = status as SubscriptionStatus;
  }

  if (planType !== "all") {
    where.planType = planType as PlanType;
  }

  if (ownerType !== "all") {
    where.ownerType = ownerType as BillingOwnerType;
  }

  // Primary sort on the requested column, secondary sort by id for stable
  // pagination when multiple rows share the same primary sort value.
  const primarySort: Prisma.SubscriptionOrderByWithRelationInput =
    sortBy === "currentPeriodEnd"
      ? { currentPeriodEnd: sortOrder }
      : sortBy === "status"
        ? { status: sortOrder }
        : { createdAt: sortOrder };

  const skip = (page - 1) * pageSize;

  const [total, subscriptions] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      select: SUBSCRIPTION_LIST_SELECT,
      orderBy: [primarySort, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const items = subscriptions.map((sub) => ({
    id: sub.id,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    stripeCustomerId: sub.stripeCustomerId,
    planType: sub.planType,
    status: sub.status,
    ownerType: sub.ownerType,
    ownerDisplay:
      sub.ownerType === "ENTERPRISE"
        ? (sub.enterprise?.name ?? null)
        : (sub.user?.name ?? null),
    ownerEmail:
      sub.ownerType === "ENTERPRISE"
        ? (sub.enterprise?.owner?.email ?? null)
        : (sub.user?.email ?? null),
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    createdAt: sub.createdAt.toISOString(),
  }));

  return NextResponse.json({
    items,
    page,
    pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  });
}
