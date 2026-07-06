import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewEnterprises } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";

const ENTERPRISE_DETAIL_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  owner: {
    select: { id: true, email: true, name: true },
  },
  subscriptions: {
    select: { planType: true, status: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  members: {
    select: {
      id: true,
      user: { select: { id: true, email: true, name: true } },
      role: { select: { name: true } },
    },
  },
  invites: {
    select: {
      id: true,
      email: true,
      status: true,
      createdAt: true,
      role: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.EnterpriseSelect;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewEnterprises(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id },
    select: ENTERPRISE_DETAIL_SELECT,
  });

  if (!enterprise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Audit entries are attached to a single entityId; enterprise-scoped actions may
  // record the enterprise's own id or a member/invite id, so match on all of them.
  const relatedIds = [
    enterprise.id,
    ...enterprise.members.map((m) => m.id),
    ...enterprise.invites.map((i) => i.id),
  ];

  const auditLog = await prisma.adminLog.findMany({
    where: {
      entityType: {
        in: [
          ENTITY_TYPES.ENTERPRISE,
          ENTITY_TYPES.ENTERPRISE_MEMBER,
          ENTITY_TYPES.ENTERPRISE_INVITE,
        ],
      },
      entityId: { in: relatedIds },
    },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  const subscription = enterprise.subscriptions[0];

  return NextResponse.json({
    id: enterprise.id,
    name: enterprise.name,
    planType: subscription?.planType ?? null,
    subscriptionStatus: subscription?.status ?? null,
    createdAt: enterprise.createdAt.toISOString(),
    owner: enterprise.owner
      ? {
          id: enterprise.owner.id,
          email: enterprise.owner.email,
          name: enterprise.owner.name,
        }
      : null,
    members: enterprise.members.map((member) => ({
      id: member.id,
      email: member.user.email,
      name: member.user.name,
      role: member.role.name,
      // EnterpriseMember has no join-date column in the current schema.
      joinedAt: null,
    })),
    invites: enterprise.invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      status: invite.status,
      role: invite.role.name,
      createdAt: invite.createdAt.toISOString(),
      // Invite has no expiry column in the current schema.
      expiresAt: null,
    })),
    auditLog: auditLog.map((log) => ({
      id: log.id,
      action: log.action,
      adminUser: log.adminUser
        ? { id: log.adminUser.id, email: log.adminUser.email }
        : null,
      entityType: log.entityType,
      entityId: log.entityId,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
