import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, Prisma } from "@/app/generated/prisma/client";
import { canViewBookings } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";

const BOOKING_DETAIL_SELECT = {
  id: true,
  requestedDate: true,
  timeStart: true,
  timeEnd: true,
  capturesCount: true,
  status: true,
  paymentStatus: true,
  notes: true,
  captureLocationType: true,
  capitalCity: true,
  suburbOrTown: true,
  stateOrTerritory: true,
  postcode: true,
  addressLine1: true,
  addressLine2: true,
  locationNotes: true,
  createdAt: true,
  userId: true,
  enterpriseId: true,
  user: { select: { id: true, name: true, email: true } },
  enterprise: { select: { id: true, name: true } },
  participants: {
    select: { id: true, sortOrder: true, firstName: true, contactNumber: true },
    orderBy: { sortOrder: "asc" as const },
  },
  payments: {
    select: {
      id: true,
      type: true,
      status: true,
      amount: true,
      currency: true,
      stripeInvoiceId: true,
      stripePaymentIntentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.BookingSelect;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canViewBookings(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: BOOKING_DETAIL_SELECT,
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Booking has no direct Subscription relation — Subscription links to a
  // User or an Enterprise, not to a Booking. Surface the most recent
  // subscription for whichever owns this booking (enterprise if set, else
  // the booking's user) as read-only context, same "most recent row"
  // pattern already used for enterprise plan/status derivation.
  const subscription = booking.enterpriseId
    ? await prisma.subscription.findFirst({
        where: { enterpriseId: booking.enterpriseId },
        select: { planType: true, status: true },
        orderBy: { createdAt: "desc" },
      })
    : await prisma.subscription.findFirst({
        where: { userId: booking.userId },
        select: { planType: true, status: true },
        orderBy: { createdAt: "desc" },
      });

  // No booking mutation routes exist yet (Phase B1 is read-only), so no
  // AdminLog row has ever been written with entityType: ENTITY_TYPES.BOOKING.
  // This query is wired up for Phase B2 and will return [] until then.
  const auditLog = await prisma.adminLog.findMany({
    where: { entityType: ENTITY_TYPES.BOOKING, entityId: booking.id },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  return NextResponse.json({
    id: booking.id,
    requestedDate: booking.requestedDate.toISOString(),
    timeStart: booking.timeStart,
    timeEnd: booking.timeEnd,
    capturesCount: booking.capturesCount,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    notes: booking.notes,
    captureLocationType: booking.captureLocationType,
    capitalCity: booking.capitalCity,
    suburbOrTown: booking.suburbOrTown,
    stateOrTerritory: booking.stateOrTerritory,
    postcode: booking.postcode,
    addressLine1: booking.addressLine1,
    addressLine2: booking.addressLine2,
    locationNotes: booking.locationNotes,
    createdAt: booking.createdAt.toISOString(),
    user: booking.user,
    enterprise: booking.enterprise,
    participants: booking.participants,
    payments: booking.payments.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
    subscriptionContext: subscription
      ? { planType: subscription.planType, status: subscription.status }
      : null,
    auditLog: auditLog.map((log) => ({
      id: log.id,
      action: log.action,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
      adminUser: log.adminUser,
    })),
  });
}
