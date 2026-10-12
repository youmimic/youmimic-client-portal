import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseMembers, canActOnUser } from "@/lib/admin/rbac";
import { addEnterpriseMemberSchema } from "@/lib/validations/admin";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { sendAdminWelcomeEmail } from "@/lib/mailer";

// Matches the "member" role name the self-serve /api/invites route upserts
// for accepted invites (see ENTERPRISE_MEMBER_ROLES in lib/validations/admin.ts).
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

  const parsed = addEnterpriseMemberSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, email, confirmMultiEnterprise } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, adminRole: true },
  });

  // ---- Existing account: link them as a member, never create a duplicate ----
  if (existingUser) {
    if (!canActOnUser(actorRole, existingUser.adminRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const alreadyMember = await prisma.enterpriseMember.findUnique({
      where: { enterpriseId_userId: { enterpriseId, userId: existingUser.id } },
      select: { id: true },
    });
    if (alreadyMember) {
      return NextResponse.json(
        { error: "This user is already a member of this enterprise" },
        { status: 409 },
      );
    }

    // A user can legitimately belong to more than one enterprise (e.g. a
    // consultant working across clients), but typing the wrong email is just
    // as plausible — surface the conflict and require an explicit confirm
    // rather than silently granting cross-enterprise access.
    const otherMemberships = await prisma.enterpriseMember.findMany({
      where: { userId: existingUser.id, enterpriseId: { not: enterpriseId } },
      select: { enterprise: { select: { name: true } } },
    });
    if (otherMemberships.length > 0 && !confirmMultiEnterprise) {
      return NextResponse.json(
        {
          error: "This user already belongs to another enterprise",
          code: "ALREADY_IN_OTHER_ENTERPRISE",
          otherEnterprises: otherMemberships.map((m) => m.enterprise.name),
        },
        { status: 409 },
      );
    }

    const memberRole = await prisma.role.upsert({
      where: { name: MEMBER_ROLE_NAME },
      create: { name: MEMBER_ROLE_NAME },
      update: {},
      select: { id: true },
    });

    await prisma.enterpriseMember.create({
      data: { enterpriseId, userId: existingUser.id, roleId: memberRole.id },
    });

    await writeAuditLog({
      adminUserId: session.user.id,
      action: "add_existing_enterprise_member",
      entityType: ENTITY_TYPES.ENTERPRISE_MEMBER,
      entityId: enterpriseId,
      targetUserId: existingUser.id,
      metadata: {
        email: existingUser.email,
        otherEnterpriseCount: otherMemberships.length,
      },
    });

    return NextResponse.json(
      { user: { id: existingUser.id, name: existingUser.name, email: existingUser.email } },
      { status: 201 },
    );
  }

  // ---- No existing account: create a brand-new client user ----
  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: { name: ["Name is required for a new account"] },
      },
      { status: 422 },
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
