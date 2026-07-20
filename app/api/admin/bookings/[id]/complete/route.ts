import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageBookings } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { bookingStatusActionSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageBookings(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = bookingStatusActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { reason } = parsed.data;

  const existing = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // "completed" is only reachable from "confirmed" — a booking must be
  // confirmed before a capture can be marked complete.
  if (existing.status === "pending") {
    return NextResponse.json(
      { error: "Booking must be confirmed before it can be marked completed" },
      { status: 409 },
    );
  }
  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Cancelled bookings cannot be marked completed" },
      { status: 409 },
    );
  }
  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "Booking is already completed" },
      { status: 409 },
    );
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "completed" },
    select: { id: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "complete_booking",
    entityType: ENTITY_TYPES.BOOKING,
    entityId: id,
    reason,
  });

  revalidatePath("/dashboard/bookings");

  return NextResponse.json({ success: true, id: updated.id, status: updated.status });
}
