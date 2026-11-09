import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updateAvatarLookSchema } from "@/lib/validations/admin";

// Renames a look — the one look-level edit the per-user avatar routes don't
// have today (see lib/validations/admin.ts's updateAvatarLookSchema).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ avatarId: string; lookId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { avatarId, lookId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateAvatarLookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, isPublic: true }, select: { id: true } });
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const look = await prisma.avatarLook.findFirst({ where: { id: lookId, avatarId }, select: { id: true } });
  if (!look) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.avatarLook.update({
    where: { id: lookId },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "rename_public_avatar_look",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    metadata: { avatarLookId: lookId, name: updated.name },
  });

  return NextResponse.json({ look: updated });
}

// Mirrors the per-user delete-look route's cascade/FK comments:
// GeneratedVideo.avatarLookId is ON DELETE SET NULL, so past videos keep
// their record with just the "which look" detail cleared; VideoProject.
// defaultAvatarLookId / VideoScene.avatarLookId are plain unconstrained ids
// the app already resolves defensively, so a stale reference there just
// reads as "no look chosen" next time that project is opened. This never
// touches HeyGen itself — it only unlinks our own record of the look.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ avatarId: string; lookId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { avatarId, lookId } = await params;

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, isPublic: true }, select: { id: true } });
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
    action: "remove_public_avatar_look",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    metadata: { avatarLookId: lookId, heygenLookId: look.heygenLookId, name: look.name },
  });

  return NextResponse.json({ ok: true });
}
