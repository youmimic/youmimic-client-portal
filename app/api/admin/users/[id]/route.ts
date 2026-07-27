import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewUsers, canEditUsers, canAssignAdminRole, canActOnUser } from "@/lib/admin/rbac";
import { writeAuditLog } from "@/lib/admin/audit";
import { updateUserSchema } from "@/lib/validations/admin";

const USER_DETAIL_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  adminRole: true,
  isSuspended: true,
  suspendedAt: true,
  suspensionReason: true,
  sessionVersion: true,
  subscriptions: {
    select: {
      id: true,
      planType: true,
      status: true,
      ownerType: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 5,
  },
  enterprises: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
    },
  },
  adminLogsAsTarget: {
    select: {
      id: true,
      action: true,
      entityType: true,
      reason: true,
      createdAt: true,
      adminUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.UserSelect;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_DETAIL_SELECT,
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  const { id: targetId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, adminRole } = parsed.data;
  const isRoleChange =
    typeof rawBody === "object" &&
    rawBody !== null &&
    Object.prototype.hasOwnProperty.call(rawBody, "adminRole");

  if (name === undefined && !isRoleChange) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  if (name !== undefined && !canEditUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isRoleChange && !canAssignAdminRole(actorRole, adminRole ?? null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canActOnUser(actorRole, target.adminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isRoleChange && session.user.id === targetId) {
    return NextResponse.json(
      { error: "Cannot change your own admin role" },
      { status: 403 },
    );
  }

  const data: Prisma.UserUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (isRoleChange) data.adminRole = adminRole ?? null;

  const updated = await prisma.user.update({
    where: { id: targetId },
    data,
    select: { id: true, name: true, email: true, adminRole: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_user",
    entityType: "user",
    entityId: targetId,
    targetUserId: targetId,
    metadata: {
      ...(name !== undefined ? { name } : {}),
      ...(isRoleChange ? { adminRole: adminRole ?? null, previousAdminRole: target.adminRole } : {}),
    },
  });

  return NextResponse.json({ user: updated });
}
