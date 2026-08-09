import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updateAvatarSchema } from "@/lib/validations/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, avatarId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateAvatarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, heygenAvatarId, enterpriseId } = parsed.data;

  if (enterpriseId) {
    const related = await prisma.enterprise.findFirst({
      where: {
        id: enterpriseId,
        OR: [{ ownerUserId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });
    if (!related) {
      return NextResponse.json(
        {
          error: "That enterprise is not associated with this user",
          fieldErrors: { enterpriseId: ["Not associated with this user"] },
        },
        { status: 422 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (heygenAvatarId !== undefined) data.heygenAvatarId = heygenAvatarId;
  if (enterpriseId !== undefined) data.enterpriseId = enterpriseId;

  const avatar = await prisma.avatar.update({
    where: { id: avatarId },
    data,
    select: { id: true, name: true, heygenAvatarId: true, enterpriseId: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatar.id,
    targetUserId: userId,
    metadata: data,
  });

  return NextResponse.json({ avatar });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, avatarId } = await params;

  const existing = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: {
      id: true,
      name: true,
      subscriptions: { where: { billingComponent: "AVATAR_STORAGE" }, select: { id: true }, take: 1 },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The FK is ON DELETE SET NULL, so deleting here wouldn't fail — but it
  // would silently orphan an active billing subscription (Phase 1/2 avatar
  // billing) with no avatar to show for it. Block instead of orphaning.
  if (existing.subscriptions.length > 0) {
    return NextResponse.json(
      { error: "This avatar still has a billing subscription — remove or cancel it first." },
      { status: 409 },
    );
  }

  await prisma.avatar.delete({ where: { id: avatarId } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "unlink_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    targetUserId: userId,
    metadata: { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
