import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updatePublicAvatarSchema } from "@/lib/validations/admin";
import { verifyHeygenAvatarId } from "@/lib/heygen/sync";

export async function PATCH(
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updatePublicAvatarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // Scoped by isPublic, not userId — managing the shared pool, not one
  // customer's property (deliberately different gate from every other
  // avatar route, which all scope by { id, userId }).
  const existing = await prisma.avatar.findFirst({ where: { id: avatarId, isPublic: true }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, heygenAvatarId } = parsed.data;

  if (heygenAvatarId) {
    const verified = await verifyHeygenAvatarId(heygenAvatarId);
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error, fieldErrors: { heygenAvatarId: [verified.error] } },
        { status: 422 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (heygenAvatarId !== undefined) data.heygenAvatarId = heygenAvatarId;

  const avatar = await prisma.avatar.update({
    where: { id: avatarId },
    data,
    select: { id: true, name: true, heygenAvatarId: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_public_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatar.id,
    metadata: data,
  });

  return NextResponse.json({ avatar });
}

export async function DELETE(
  _req: Request,
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

  const existing = await prisma.avatar.findFirst({
    where: { id: avatarId, isPublic: true },
    select: {
      id: true,
      name: true,
      subscriptions: { where: { billingComponent: "AVATAR_STORAGE" }, select: { id: true }, take: 1 },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same guard as the per-user delete route — shouldn't be reachable for a
  // public avatar in practice (no enterprise to bill), kept for safety.
  if (existing.subscriptions.length > 0) {
    return NextResponse.json(
      { error: "This avatar still has a billing subscription — remove or cancel it first." },
      { status: 409 },
    );
  }

  await prisma.avatar.delete({ where: { id: avatarId } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "delete_public_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    metadata: { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
