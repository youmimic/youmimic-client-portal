import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseMembers, canActOnUser } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { removeMemberSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseMembers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = removeMemberSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { memberUserId, reason } = parsed.data;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true, ownerUserId: true },
  });

  if (!enterprise) {
    return NextResponse.json({ error: "Enterprise not found" }, { status: 404 });
  }

  if (memberUserId === enterprise.ownerUserId) {
    return NextResponse.json(
      { error: "Cannot remove the current owner as a member" },
      { status: 403 },
    );
  }

  const membership = await prisma.enterpriseMember.findUnique({
    where: { enterpriseId_userId: { enterpriseId, userId: memberUserId } },
    select: {
      id: true,
      user: { select: { id: true, email: true, name: true, adminRole: true } },
      role: { select: { name: true } },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (!canActOnUser(actorRole, membership.user.adminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.enterpriseMember.delete({ where: { id: membership.id } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "remove_enterprise_member",
    entityType: ENTITY_TYPES.ENTERPRISE_MEMBER,
    entityId: enterprise.id,
    targetUserId: membership.user.id,
    reason,
    metadata: {
      removedUserId: membership.user.id,
      removedUserEmail: membership.user.email,
      previousRole: membership.role.name,
    },
  });

  return NextResponse.json({ success: true });
}
