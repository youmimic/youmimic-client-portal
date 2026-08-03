import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseContacts } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { addEnterpriseContactSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseContacts(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = addEnterpriseContactSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true },
  });
  if (!enterprise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contact = await prisma.enterpriseContact.create({
    data: { enterpriseId, ...parsed.data },
    select: { id: true, type: true, name: true, email: true, phone: true, createdAt: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "add_enterprise_contact",
    entityType: ENTITY_TYPES.ENTERPRISE_CONTACT,
    entityId: contact.id,
    metadata: { enterpriseId, type: contact.type, name: contact.name },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
