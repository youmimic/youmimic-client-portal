import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterprises } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { adminActionSchema } from "@/lib/validations/admin";

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

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = adminActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { reason } = parsed.data;

  const target = await prisma.enterprise.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.status !== "suspended") {
    return NextResponse.json({ error: "Enterprise is not suspended" }, { status: 409 });
  }

  const updated = await prisma.enterprise.update({
    where: { id },
    data: { status: "active", suspendedAt: null, suspensionReason: null },
    select: { id: true, status: true, suspendedAt: true, suspensionReason: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "reactivate_enterprise",
    entityType: ENTITY_TYPES.ENTERPRISE,
    entityId: id,
    reason,
  });

  return NextResponse.json({ enterprise: updated });
}
