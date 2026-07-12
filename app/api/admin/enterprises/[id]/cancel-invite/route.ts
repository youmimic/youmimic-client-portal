import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseMembers } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { cancelInviteSchema } from "@/lib/validations/admin";

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

  const parsed = cancelInviteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { inviteId, reason } = parsed.data;

  const invite = await prisma.invite.findUnique({
    where: { id: inviteId },
    select: { id: true, email: true, status: true, enterpriseId: true },
  });

  if (!invite || invite.enterpriseId !== enterpriseId) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending invites can be cancelled" },
      { status: 409 },
    );
  }

  await prisma.invite.update({
    where: { id: invite.id },
    data: { status: "cancelled" },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "cancel_enterprise_invite",
    entityType: ENTITY_TYPES.ENTERPRISE_INVITE,
    entityId: enterpriseId,
    reason,
    metadata: { inviteId: invite.id, email: invite.email },
  });

  return NextResponse.json({ success: true });
}
