import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseContacts } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updateEnterpriseContactSchema } from "@/lib/validations/admin";

async function loadContact(enterpriseId: string, contactId: string) {
  return prisma.enterpriseContact.findFirst({
    where: { id: contactId, enterpriseId },
    select: { id: true, type: true, name: true, email: true, phone: true },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseContacts(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId, contactId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateEnterpriseContactSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const existing = await loadContact(enterpriseId, contactId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.enterpriseContact.update({
    where: { id: contactId },
    data: parsed.data,
    select: { id: true, type: true, name: true, email: true, phone: true, createdAt: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_enterprise_contact",
    entityType: ENTITY_TYPES.ENTERPRISE_CONTACT,
    entityId: contactId,
    metadata: { enterpriseId, changes: parsed.data },
  });

  return NextResponse.json({ contact: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseContacts(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId, contactId } = await params;

  const existing = await loadContact(enterpriseId, contactId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.enterpriseContact.delete({ where: { id: contactId } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "remove_enterprise_contact",
    entityType: ENTITY_TYPES.ENTERPRISE_CONTACT,
    entityId: contactId,
    metadata: { enterpriseId, type: existing.type, name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
