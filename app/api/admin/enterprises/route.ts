import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type {
  AdminRole,
  PlanType,
  Prisma,
  SubscriptionStatus,
} from "@/app/generated/prisma/client";
import { canViewEnterprises } from "@/lib/admin/rbac";
import { listEnterprisesQuerySchema } from "@/lib/validations/admin";

const ENTERPRISE_LIST_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  owner: {
    select: { id: true, email: true, name: true },
  },
  subscriptions: {
    select: { planType: true, status: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  _count: {
    select: { members: true },
  },
} satisfies Prisma.EnterpriseSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewEnterprises(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listEnterprisesQuerySchema.safeParse(
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

  const { page, pageSize, search, subscriptionStatus, planType, sortBy, sortOrder } =
    parsed.data;

  const where: Prisma.EnterpriseWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { owner: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (subscriptionStatus === "none") {
    where.subscriptions = { none: {} };
  } else {
    const subscriptionFilter: Prisma.SubscriptionWhereInput = {};
    if (subscriptionStatus !== "all") {
      subscriptionFilter.status = subscriptionStatus as SubscriptionStatus;
    }
    if (planType !== "all") {
      subscriptionFilter.planType = planType as PlanType;
    }
    if (Object.keys(subscriptionFilter).length > 0) {
      where.subscriptions = { some: subscriptionFilter };
    }
  }

  // Primary sort on the requested column, secondary sort by id for stable pagination
  // when multiple rows share the same primary sort value.
  const primarySort: Prisma.EnterpriseOrderByWithRelationInput =
    sortBy === "name"
      ? { name: sortOrder }
      : sortBy === "ownerEmail"
        ? { owner: { email: sortOrder } }
        : { createdAt: sortOrder };

  const skip = (page - 1) * pageSize;

  const [total, enterprises] = await Promise.all([
    prisma.enterprise.count({ where }),
    prisma.enterprise.findMany({
      where,
      select: ENTERPRISE_LIST_SELECT,
      orderBy: [primarySort, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const items = enterprises.map((enterprise) => {
    const subscription = enterprise.subscriptions[0];
    return {
      id: enterprise.id,
      name: enterprise.name,
      owner: enterprise.owner
        ? {
            id: enterprise.owner.id,
            email: enterprise.owner.email,
            name: enterprise.owner.name,
          }
        : null,
      planType: subscription?.planType ?? null,
      subscriptionStatus: subscription?.status ?? null,
      membersCount: enterprise._count.members,
      createdAt: enterprise.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    items,
    page,
    pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  });
}
