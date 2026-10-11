import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseMembers } from "@/lib/admin/rbac";
import { createUserSchema } from "@/lib/validations/admin";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { sendAdminWelcomeEmail } from "@/lib/mailer";

// Matches the "member" role name the self-serve /api/invites route upserts
// for accepted invites — this route creates the account and membership
// directly, skipping the invite-email/accept round trip entirely, so a new
// client shows up under the enterprise immediately.
const MEMBER_ROLE_NAME = "member";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseMembers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true },
  });
  if (!enterprise) {
    return NextResponse.json({ error: "Enterprise not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, email } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json(
      {
        error: "A user with this email already exists",
        fieldErrors: { email: ["Already in use"] },
      },
      { status: 409 },
    );
  }

  // Same convention as the standalone admin-created user (app/api/admin/users/route.ts):
  // no usable password — the person sets their own via the emailed set-password link.
  const unusablePasswordHash = await bcrypt.hash(crypto.randomUUID(), 12);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour, same as forgot-password

  const memberRole = await prisma.role.upsert({
    where: { name: MEMBER_ROLE_NAME },
    create: { name: MEMBER_ROLE_NAME },
    update: {},
    select: { id: true },
  });

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: unusablePasswordHash,
        emailVerified: false,
      },
      select: { id: true, name: true, email: true },
    });

    await tx.passwordResetToken.create({
      data: { userId: created.id, token, expiresAt, used: false },
    });

    await tx.enterpriseMember.create({
      data: { enterpriseId, userId: created.id, roleId: memberRole.id },
    });

    return created;
  });

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) throw new Error("NEXTAUTH_URL is not configured");

  const setPasswordUrl = new URL("/reset-password", appUrl);
  setPasswordUrl.searchParams.set("token", token);

  try {
    await sendAdminWelcomeEmail({
      to: user.email,
      name: user.name,
      setPasswordUrl: setPasswordUrl.toString(),
    });
  } catch (err) {
    console.error("Admin welcome email failed:", err);
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_enterprise_member",
    entityType: ENTITY_TYPES.ENTERPRISE_MEMBER,
    entityId: enterpriseId,
    targetUserId: user.id,
    metadata: { email: user.email, name: user.name },
  });

  return NextResponse.json({ user }, { status: 201 });
}
