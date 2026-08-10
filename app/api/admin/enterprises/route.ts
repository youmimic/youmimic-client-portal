import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type {
  AdminRole,
  PlanType,
  Prisma,
  SubscriptionStatus,
} from "@/app/generated/prisma/client";
import { canViewEnterprises, canManageEnterprises } from "@/lib/admin/rbac";
import { listEnterprisesQuerySchema, createEnterpriseSchema } from "@/lib/validations/admin";
import { writeAuditLog } from "@/lib/admin/audit";

const ENTERPRISE_LIST_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  owner: {
    select: { id: true, email: true, name: true },
  },
  subscriptions: {
    // STANDARD only — excludes Phase 1 avatar-billing rows (PLATFORM_FEE /
    // AVATAR_STORAGE) so this list preview shows the enterprise's actual
    // plan, not whichever billing-component row was touched most recently.
    where: { billingComponent: "STANDARD" },
    select: { planType: true, status: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  _count: {
    select: { members: true },
  },
  // Looks has no direct relation to Enterprise (only Avatar -> AvatarLook),
  // so this pulls each avatar's own look count and the route sums them —
  // avoids a raw SQL join for what's a small, paginated (20/page) list.
  avatars: {
    select: { _count: { select: { looks: true } } },
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
      avatarsCount: enterprise.avatars.length,
      looksCount: enterprise.avatars.reduce((sum, a) => sum + a._count.looks, 0),
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterprises(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createEnterpriseSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, ownerEmail } = parsed.data;

  const owner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json(
      {
        error: "No user with this email exists",
        fieldErrors: { ownerEmail: ["No user found with this email"] },
      },
      { status: 404 },
    );
  }
  const ownerUserId = owner.id;

  const enterprise = await prisma.$transaction(async (tx) => {
    // Same idempotent upsert as the self-service business-signup path
    // (lib/auth/register-user.ts) — the "owner" Role row is shared, not
    // per-enterprise.
    const ownerRole = await tx.role.upsert({
      where: { name: "owner" },
      create: { name: "owner" },
      update: {},
      select: { id: true },
    });

    const created = await tx.enterprise.create({
      data: { name, ownerUserId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    });

    await tx.enterpriseMember.create({
      data: { enterpriseId: created.id, userId: ownerUserId, roleId: ownerRole.id },
    });

    return created;
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_enterprise",
    entityType: "enterprise",
    entityId: enterprise.id,
  });

  return NextResponse.json({ enterprise }, { status: 201 });
}
