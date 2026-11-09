import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { reorderAvatarLooksSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { avatarId } = await params;

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, isPublic: true }, select: { id: true } });
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = reorderAvatarLooksSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { orderedIds } = parsed.data;

  const existing = await prisma.avatarLook.findMany({
    where: { id: { in: orderedIds }, avatarId },
    select: { id: true },
  });
  if (existing.length !== orderedIds.length) {
    return NextResponse.json({ error: "One or more looks no longer exist" }, { status: 422 });
  }

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.avatarLook.update({ where: { id }, data: { sortOrder: index } })),
  );

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "reorder_public_avatar_looks",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    metadata: { orderedIds },
  });

  return NextResponse.json({ ok: true });
}
