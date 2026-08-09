import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { syncAvatarFromHeyGen, syncAvatarLookFromHeyGen } from "@/lib/heygen/sync";

// The admin panel otherwise only ever displays whatever's already in the DB
// — the only page that pulls fresh status from HeyGen is the customer's own
// /dashboard/avatars on load. This lets an admin trigger the same pull
// directly (e.g. right after fixing a bad HeyGen id) without having to wait
// for the customer to visit their dashboard first.
export async function POST(
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

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: {
      id: true,
      heygenAvatarId: true,
      looks: { select: { id: true, heygenLookId: true } },
    },
  });
  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (avatar.looks.length > 0) {
    const results = await Promise.allSettled(
      avatar.looks.map((look) => syncAvatarLookFromHeyGen(look.id, look.heygenLookId)),
    );
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
    if (failed.length === avatar.looks.length) {
      return NextResponse.json({ error: "Sync failed for every look — check the HeyGen ids" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, syncedLooks: avatar.looks.length - failed.length, failedLooks: failed.length });
  }

  if (!avatar.heygenAvatarId) {
    return NextResponse.json({ error: "This avatar has no HeyGen id linked yet" }, { status: 422 });
  }

  const result = await syncAvatarFromHeyGen(avatar.id, avatar.heygenAvatarId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
