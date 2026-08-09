import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { linkAvatarGroupSchema } from "@/lib/validations/admin";
import { planAvatarGroupLink, executeAvatarGroupLink } from "@/lib/heygen/import-avatars";

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

  const parsed = linkAvatarGroupSchema.safeParse(rawBody);
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

  const { heygenGroupId, enterpriseId, dryRun } = parsed.data;

  // Same rule as the single-look "Link Avatar" flow: an avatar's enterprise
  // (if any) must be one this user actually owns or belongs to.
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

  try {
    if (dryRun) {
      const plan = await planAvatarGroupLink(userId, heygenGroupId);
      return NextResponse.json({ dryRun: true, plan });
    }

    const result = await executeAvatarGroupLink(session.user.id, userId, heygenGroupId, enterpriseId ?? null);
    return NextResponse.json({ dryRun: false, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
