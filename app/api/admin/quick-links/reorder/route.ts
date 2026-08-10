import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageQuickLinks } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { reorderQuickLinksSchema } from "@/lib/validations/admin";

// Rewrites every row's `order` to match the position of its id in the
// caller's array — the whole list moves in one drag-and-drop drop, not one
// row at a time, so this always receives the complete new ordering rather
// than a single before/after pair.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageQuickLinks(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = reorderQuickLinksSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { orderedIds } = parsed.data;

  const existing = await prisma.quickLink.findMany({ where: { id: { in: orderedIds } }, select: { id: true } });
  if (existing.length !== orderedIds.length) {
    return NextResponse.json({ error: "One or more quick links no longer exist" }, { status: 422 });
  }

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.quickLink.update({ where: { id }, data: { order: index } })),
  );

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "reorder_quick_links",
    entityType: ENTITY_TYPES.QUICK_LINK,
    metadata: { orderedIds },
  });

  return NextResponse.json({ ok: true });
}
