import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewUsers } from "@/lib/admin/rbac";

const USER_DETAIL_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  adminRole: true,
  isSuspended: true,
  suspendedAt: true,
  suspensionReason: true,
  sessionVersion: true,
  subscriptions: {
    select: {
      id: true,
      planType: true,
      status: true,
      ownerType: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 5,
  },
  enterprises: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
    },
  },
  adminLogsAsTarget: {
    select: {
      id: true,
      action: true,
      entityType: true,
      reason: true,
      createdAt: true,
      adminUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.UserSelect;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_DETAIL_SELECT,
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
