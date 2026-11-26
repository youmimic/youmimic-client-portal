import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";

const bodySchema = z.object({ value: z.enum(["UNKNOWN", "SUPPORTED", "UNSUPPORTED"]) }).strict();

// Records whether a look can be cut out for a custom photo/video background
// (AvatarLook.backgroundRemoval). The provider's API has no field for this,
// so an admin sets it after a test render; customers are only offered
// backgrounds for SUPPORTED looks. Works for any look (client or shared
// avatar), same RBAC and audit trail as the other look actions.
export async function PATCH(req: Request, { params }: { params: Promise<{ lookId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAvatars(session.user.adminRole as AdminRole | null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const { lookId } = await params;
  const look = await prisma.avatarLook.findUnique({
    where: { id: lookId },
    select: { id: true, name: true, heygenLookId: true, backgroundRemoval: true, avatar: { select: { id: true, userId: true } } },
  });
  if (!look) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.avatarLook.update({ where: { id: lookId }, data: { backgroundRemoval: parsed.data.value } });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "set_look_background_removal",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: look.avatar.id,
    targetUserId: look.avatar.userId,
    metadata: { avatarLookId: look.id, heygenLookId: look.heygenLookId, name: look.name, from: look.backgroundRemoval, to: parsed.data.value },
  });

  return NextResponse.json({ ok: true, value: parsed.data.value });
}
