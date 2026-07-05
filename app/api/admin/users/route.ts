import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewUsers } from "@/lib/admin/rbac";
import { listUsersQuerySchema } from "@/lib/validations/admin";

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  createdAt: true,
  adminRole: true,
  isSuspended: true,
  suspendedAt: true,
  sessionVersion: true,
} satisfies Prisma.UserSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewUsers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { page, pageSize, search, adminRole: roleFilter, isSuspended, sortBy, sortOrder } =
    parsed.data;

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  if (roleFilter !== "all") {
    where.adminRole = roleFilter as AdminRole;
  }

  if (isSuspended !== "all") {
    where.isSuspended = isSuspended === "true";
  }

  // Primary sort on the requested column, secondary sort by id for stable pagination
  // when multiple rows share the same primary sort value.
  const primarySort: Prisma.UserOrderByWithRelationInput =
    sortBy === "name"
      ? { name: sortOrder }
      : sortBy === "email"
        ? { email: sortOrder }
        : { createdAt: sortOrder };

  const skip = (page - 1) * pageSize;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: [primarySort, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
