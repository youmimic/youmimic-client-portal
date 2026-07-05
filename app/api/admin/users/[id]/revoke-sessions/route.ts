import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canRevokeSessions, canActOnUser } from "@/lib/admin/rbac";
import { writeAuditLog } from "@/lib/admin/audit";
import { adminActionSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canRevokeSessions(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetId } = await params;

  if (session.user.id === targetId) {
    return NextResponse.json(
      { error: "Cannot revoke your own sessions via this endpoint" },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = adminActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { reason } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true, sessionVersion: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canActOnUser(actorRole, target.adminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Incrementing sessionVersion makes the target's current JWT stale.
  // On their next trigger === "update" call, auth.ts detects the mismatch
  // and returns null to revoke the token (JWT-expiry-window approach).
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { sessionVersion: { increment: 1 } },
    select: { id: true, sessionVersion: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "revoke_sessions",
    entityType: "user",
    entityId: targetId,
    targetUserId: targetId,
    reason,
    metadata: { newSessionVersion: updated.sessionVersion },
  });

  return NextResponse.json({ sessionVersion: updated.sessionVersion });
}
