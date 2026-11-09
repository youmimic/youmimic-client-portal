import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { createPublicAvatarSchema } from "@/lib/validations/admin";
import { verifyHeygenAvatarId } from "@/lib/heygen/sync";

// Platform-wide pool of avatars any signed-in user can generate with —
// managed here rather than under a specific customer's admin page, since
// these aren't any one customer's property. See lib/avatar-access.ts for
// where isPublic actually gates access.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const avatars = await prisma.avatar.findMany({
    where: { isPublic: true },
    include: {
      looks: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, heygenLookId: true, status: true, previewUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ avatars });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createPublicAvatarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, heygenAvatarId } = parsed.data;

  // Same live-existence check as the per-user "Link Avatar" flow — a
  // manually-typed id that doesn't resolve as either a look or a plain
  // avatar would otherwise save silently and sit stuck on "pending" forever.
  if (heygenAvatarId) {
    const verified = await verifyHeygenAvatarId(heygenAvatarId);
    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error, fieldErrors: { heygenAvatarId: [verified.error] } },
        { status: 422 },
      );
    }
  }

  // Still needs a real userId for the DB row (schema requires one, and the
  // per-user admin UI needs an owner to key off) — the acting admin's own
  // account, invisible to this management surface itself. No enterprise:
  // a public avatar isn't any one customer's property.
  const avatar = await prisma.avatar.create({
    data: {
      userId: session.user.id,
      name,
      heygenAvatarId: heygenAvatarId ?? null,
      isPublic: true,
    },
    select: { id: true, name: true, heygenAvatarId: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_public_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: avatar.id,
    metadata: { name, heygenAvatarId: heygenAvatarId ?? null },
  });

  return NextResponse.json({ avatar }, { status: 201 });
}
