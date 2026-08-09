import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { linkAvatarSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = linkAvatarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, heygenAvatarId, enterpriseId } = parsed.data;

  // An avatar's enterprise (if any) must be one this user actually owns or
  // belongs to — prevents accidentally linking an avatar to an unrelated
  // enterprise via a typo'd ID.
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

  const avatar = await prisma.avatar.create({
    data: {
      userId,
      enterpriseId: enterpriseId ?? null,
      name,
      heygenAvatarId: heygenAvatarId ?? null,
    },
    select: { id: true, name: true, heygenAvatarId: true, enterpriseId: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "link_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatar.id,
    targetUserId: userId,
    metadata: { name, heygenAvatarId: heygenAvatarId ?? null, enterpriseId: enterpriseId ?? null },
  });

  return NextResponse.json({ avatar }, { status: 201 });
}
