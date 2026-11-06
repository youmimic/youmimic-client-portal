import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";

// Unlinks a single look from an avatar. Mirrors the whole-avatar DELETE
// route (../route.ts) — same ownership check, same RBAC, same audit
// pattern. Unlike that route, no billing-subscription guard is needed:
// AVATAR_STORAGE billing is per-Avatar, never per-look. GeneratedVideo.
// avatarLookId is ON DELETE SET NULL, so past videos keep their record
// with just the "which look" detail cleared; VideoProject.
// defaultAvatarLookId / VideoScene.avatarLookId are plain unconstrained
// ids the app already resolves defensively (same as a deleted Avatar.id
// today), so a stale reference there just reads as "no look chosen" next
// time that project is opened. This never touches HeyGen itself — it only
// unlinks our own record of the look.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string; lookId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, avatarId, lookId } = await params;

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: { id: true },
  });
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const look = await prisma.avatarLook.findFirst({
    where: { id: lookId, avatarId },
    select: { id: true, name: true, heygenLookId: true },
  });
  if (!look) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.avatarLook.delete({ where: { id: lookId } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "remove_avatar_look",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    targetUserId: userId,
    metadata: { avatarLookId: lookId, heygenLookId: look.heygenLookId, name: look.name },
  });

  return NextResponse.json({ ok: true });
}
