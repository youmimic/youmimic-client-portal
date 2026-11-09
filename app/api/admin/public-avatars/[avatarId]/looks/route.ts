import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { addAvatarLookSchema } from "@/lib/validations/admin";
import { addAvatarLookFromHeyGen } from "@/lib/heygen/sync";

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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = addAvatarLookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await prisma.avatar.findFirst({ where: { id: avatarId, isPublic: true }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await addAvatarLookFromHeyGen(avatarId, parsed.data.heygenLookId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: { heygenLookId: [result.error] } },
      { status: 422 },
    );
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "add_public_avatar_look",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatarId,
    metadata: { heygenLookId: parsed.data.heygenLookId, avatarLookId: result.lookId },
  });

  return NextResponse.json({ ok: true, avatarLookId: result.lookId }, { status: 201 });
}
