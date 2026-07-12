import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterprises, canActOnUser } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { transferOwnerSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterprises(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = transferOwnerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { newOwnerUserId, reason } = parsed.data;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: {
      id: true,
      ownerUserId: true,
      owner: { select: { id: true, email: true, name: true, adminRole: true } },
    },
  });

  if (!enterprise) {
    return NextResponse.json({ error: "Enterprise not found" }, { status: 404 });
  }

  if (newOwnerUserId === enterprise.ownerUserId) {
    return NextResponse.json(
      { error: "This user already owns the enterprise" },
      { status: 409 },
    );
  }

  // New owner must already be a member of this enterprise — the current data
  // model has no safe way to "promote" an arbitrary user without first
  // establishing that relationship, so membership is required rather than
  // created on the fly.
  const membership = await prisma.enterpriseMember.findUnique({
    where: { enterpriseId_userId: { enterpriseId, userId: newOwnerUserId } },
    select: {
      user: { select: { id: true, email: true, name: true, adminRole: true, isSuspended: true } },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "The new owner must already be a member of this enterprise" },
      { status: 422 },
    );
  }

  const newOwner = membership.user;

  if (newOwner.isSuspended) {
    return NextResponse.json(
      { error: "Cannot transfer ownership to a suspended user" },
      { status: 409 },
    );
  }

  if (
    !canActOnUser(actorRole, enterprise.owner?.adminRole ?? null) ||
    !canActOnUser(actorRole, newOwner.adminRole)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.enterprise.update({
    where: { id: enterpriseId },
    data: { ownerUserId: newOwnerUserId },
    select: {
      id: true,
      owner: { select: { id: true, email: true, name: true } },
    },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "transfer_enterprise_owner",
    entityType: ENTITY_TYPES.ENTERPRISE,
    entityId: enterprise.id,
    targetUserId: newOwnerUserId,
    reason,
    metadata: {
      oldOwnerId: enterprise.owner?.id ?? enterprise.ownerUserId,
      oldOwnerEmail: enterprise.owner?.email ?? null,
      newOwnerId: newOwner.id,
      newOwnerEmail: newOwner.email,
    },
  });

  return NextResponse.json({ success: true, owner: updated.owner });
}
