import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { canViewActivity } from "@/lib/admin/rbac";
import { listSystemEventsQuerySchema } from "@/lib/validations/admin";

const SYSTEM_EVENT_LIST_SELECT = {
  id: true,
  type: true,
  source: true,
  message: true,
  metadata: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  enterprise: { select: { id: true, name: true } },
} satisfies Prisma.SystemEventSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewActivity(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listSystemEventsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { page, pageSize, search, type } = parsed.data;

  const where: Prisma.SystemEventWhereInput = {};

  if (type !== "all") {
    where.type = type;
  }

  if (search) {
    where.OR = [
      { message: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { enterprise: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [total, events] = await Promise.all([
    prisma.systemEvent.count({ where }),
    prisma.systemEvent.findMany({
      where,
      select: SYSTEM_EVENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const items = events.map((event) => ({
    id: event.id,
    type: event.type,
    source: event.source,
    message: event.message,
    metadata: event.metadata,
    userName: event.user?.name ?? null,
    userEmail: event.user?.email ?? null,
    enterpriseName: event.enterprise?.name ?? null,
    createdAt: event.createdAt.toISOString(),
  }));

  return NextResponse.json({
    items,
    page,
    pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  });
}
