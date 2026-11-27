import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { queueLookCutout } from "@/lib/backgrounds/cutouts";

// Queues one look for a cut-out preview ("Make cut-out" / "Make again"). The
// cut-out cron picks it up within about 10 minutes.
export async function POST(_req: Request, { params }: { params: Promise<{ lookId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAvatars(session.user.adminRole as AdminRole | null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lookId } = await params;
  const look = await prisma.avatarLook.findUnique({
    where: { id: lookId },
    select: { id: true, name: true, status: true, avatar: { select: { id: true, userId: true } } },
  });
  if (!look) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (look.status !== "ready") return NextResponse.json({ error: "This look isn't ready yet." }, { status: 422 });

  const queued = await queueLookCutout(lookId);
  if (!queued) return NextResponse.json({ error: "A cut-out is already being made for this look." }, { status: 409 });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "queue_look_cutout",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: look.avatar.id,
    targetUserId: look.avatar.userId,
    metadata: { avatarLookId: look.id, name: look.name },
  });
  return NextResponse.json({ ok: true, status: "QUEUED" });
}
