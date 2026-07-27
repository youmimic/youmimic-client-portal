import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewUsers, canCreateUsers } from "@/lib/admin/rbac";
import { listUsersQuerySchema, createUserSchema } from "@/lib/validations/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { sendAdminWelcomeEmail } from "@/lib/mailer";

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  adminRole: true,
  isSuspended: true,
  suspendedAt: true,
  sessionVersion: true,
} satisfies Prisma.UserSelect;

// Only pulled in for the Enterprise User tab — a user can belong to more
// than one enterprise, so this returns every membership rather than "the"
// company.
const ENTERPRISE_MEMBERSHIPS_SELECT = {
  enterpriseMembers: {
    select: {
      enterprise: { select: { id: true, name: true } },
      role: { select: { name: true } },
    },
  },
} satisfies Prisma.UserSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const {
    page,
    pageSize,
    search,
    userType,
    adminRole: roleFilter,
    enterpriseRole,
    isSuspended,
    sortBy,
    sortOrder,
  } = parsed.data;

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  // "All roles" within the Admin tab still means "any admin role", not
  // "unfiltered" — only userType === "all" leaves adminRole untouched.
  if (roleFilter !== "all") {
    where.adminRole = roleFilter as AdminRole;
  } else if (userType === "admin") {
    where.adminRole = { not: null };
  }

  if (enterpriseRole !== "all") {
    where.enterpriseMembers = { some: { role: { name: enterpriseRole } } };
  } else if (userType === "enterprise") {
    where.enterpriseMembers = { some: {} };
  }

  if (isSuspended !== "all") {
    where.isSuspended = isSuspended === "true";
  }

  // Primary sort on the requested column, secondary sort by id for stable pagination
  // when multiple rows share the same primary sort value.
  const primarySort: Prisma.UserOrderByWithRelationInput =
    sortBy === "name"
      ? { name: sortOrder }
      : sortBy === "email"
        ? { email: sortOrder }
        : { createdAt: sortOrder };

  const skip = (page - 1) * pageSize;

  const select =
    userType === "enterprise"
      ? { ...USER_LIST_SELECT, ...ENTERPRISE_MEMBERSHIPS_SELECT }
      : USER_LIST_SELECT;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select,
      orderBy: [primarySort, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canCreateUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, email } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "A user with this email already exists",
        fieldErrors: { email: ["Already in use"] },
      },
      { status: 409 },
    );
  }

  // No one is ever meant to authenticate with this hash — it's a random
  // value nobody knows, discarded immediately. The account only becomes
  // usable once the person sets their own password via the emailed link.
  const unusablePasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour, same as forgot-password

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: unusablePasswordHash,
        emailVerified: false,
      },
      select: { id: true, name: true, email: true },
    });

    await tx.passwordResetToken.create({
      data: { userId: created.id, token, expiresAt, used: false },
    });

    return created;
  });

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) throw new Error("NEXTAUTH_URL is not configured");

  const setPasswordUrl = new URL("/reset-password", appUrl);
  setPasswordUrl.searchParams.set("token", token);

  try {
    await sendAdminWelcomeEmail({
      to: user.email,
      name: user.name,
      setPasswordUrl: setPasswordUrl.toString(),
    });
  } catch (err) {
    console.error("Admin welcome email failed:", err);
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_user",
    entityType: "user",
    entityId: user.id,
    targetUserId: user.id,
  });

  return NextResponse.json({ user }, { status: 201 });
}
