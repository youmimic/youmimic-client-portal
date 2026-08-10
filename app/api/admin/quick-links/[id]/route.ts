import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageQuickLinks } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updateQuickLinkSchema } from "@/lib/validations/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageQuickLinks(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateQuickLinkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await prisma.quickLink.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quickLink = await prisma.quickLink.update({
    where: { id },
    data: parsed.data,
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_quick_link",
    entityType: ENTITY_TYPES.QUICK_LINK,
    entityId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ quickLink });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageQuickLinks(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.quickLink.findUnique({
    where: { id },
    select: { id: true, label: true, isDefault: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Enforced here, not just hidden in the UI — a direct API call must be
  // blocked the same way a click would be.
  if (existing.isDefault) {
    return NextResponse.json({ error: "This is a default quick link and can't be removed." }, { status: 422 });
  }

  await prisma.quickLink.delete({ where: { id } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "delete_quick_link",
    entityType: ENTITY_TYPES.QUICK_LINK,
    entityId: id,
    metadata: { label: existing.label },
  });

  return NextResponse.json({ ok: true });
}
