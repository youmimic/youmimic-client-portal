import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { testLinkAvatarSchema } from "@/lib/validations/admin";
import { getOrCreateTestAvatarLink } from "@/lib/heygen/sync";

// Always links to the CALLING admin's own account — there is no userId in
// this route on purpose, so it can never be pointed at anyone else's.
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

  const parsed = testLinkAvatarSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { heygenId, name, company } = parsed.data;

  const result = await getOrCreateTestAvatarLink(session.user.id, heygenId, name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "test_link_avatar",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: result.avatarId,
    targetUserId: session.user.id,
    metadata: { heygenId, name, company: company ?? null },
  });

  const script = company ? `Hi this is the avatar of ${name} from ${company}` : `Hi this is the avatar of ${name}`;

  return NextResponse.json({ avatarId: result.avatarId, script });
}
