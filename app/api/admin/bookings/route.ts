import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, BookingStatus, Prisma } from "@/app/generated/prisma/client";
import { canViewBookings } from "@/lib/admin/rbac";
import { listBookingsQuerySchema } from "@/lib/validations/admin";

const BOOKING_LIST_SELECT = {
  id: true,
  requestedDate: true,
  timeStart: true,
  timeEnd: true,
  capturesCount: true,
  status: true,
  paymentStatus: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  enterprise: { select: { id: true, name: true } },
} satisfies Prisma.BookingSelect;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewBookings(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = listBookingsQuerySchema.safeParse(
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

  const { page, pageSize, search, status, kind, sortBy, sortOrder, dateFrom, dateTo } =
    parsed.data;

  const where: Prisma.BookingWhereInput = {};

  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { enterprise: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (status !== "all") {
    where.status = status as BookingStatus;
  }

  if (kind === "personal") {
    where.enterpriseId = null;
  } else if (kind === "enterprise") {
    where.enterpriseId = { not: null };
  }

  if (dateFrom || dateTo) {
    where.requestedDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  // Primary sort on the requested column, secondary sort by id for stable
  // pagination when multiple rows share the same primary sort value.
  const primarySort: Prisma.BookingOrderByWithRelationInput =
    sortBy === "createdAt" ? { createdAt: sortOrder } : { requestedDate: sortOrder };

  const skip = (page - 1) * pageSize;

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      select: BOOKING_LIST_SELECT,
      orderBy: [primarySort, { id: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const items = bookings.map((booking) => ({
    id: booking.id,
    user: booking.user,
    enterprise: booking.enterprise,
    requestedDate: booking.requestedDate.toISOString(),
    timeStart: booking.timeStart,
    timeEnd: booking.timeEnd,
    capturesCount: booking.capturesCount,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
  }));

  return NextResponse.json({
    items,
    page,
    pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / pageSize),
  });
}
