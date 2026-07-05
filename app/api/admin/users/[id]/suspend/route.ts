import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canSuspendUser, canActOnUser } from "@/lib/admin/rbac";
import { writeAuditLog } from "@/lib/admin/audit";
import { suspendUserSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canSuspendUser(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetId } = await params;

  if (session.user.id === targetId) {
    return NextResponse.json(
      { error: "Cannot suspend your own account" },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = suspendUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { reason } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true, isSuspended: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canActOnUser(actorRole, target.adminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (target.isSuspended) {
    return NextResponse.json(
      { error: "User is already suspended" },
      { status: 409 },
    );
  }

  const now = new Date();

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      isSuspended: true,
      suspendedAt: now,
      suspensionReason: reason,
    },
    select: {
      id: true,
      isSuspended: true,
      suspendedAt: true,
      suspensionReason: true,
    },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "suspend_user",
    entityType: "user",
    entityId: targetId,
    targetUserId: targetId,
    reason,
  });

  return NextResponse.json({ user: updated });
}
