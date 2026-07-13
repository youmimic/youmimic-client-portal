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

  // "confirmed" is only reachable from "pending" — no code path in this app
  // has ever set a booking to "confirmed" before this route existed, so this
  // is the first place that transition is exercised.
  if (existing.status === "confirmed") {
    return NextResponse.json(
      { error: "Booking is already confirmed" },
      { status: 409 },
    );
  }
  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Cancelled bookings cannot be confirmed" },
      { status: 409 },
    );
  }
  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "Completed bookings cannot be confirmed" },
      { status: 409 },
    );
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "confirmed" },
    select: { id: true, status: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "confirm_booking",
    entityType: ENTITY_TYPES.BOOKING,
    entityId: id,
    reason,
  });

  revalidatePath("/dashboard/bookings");

  return NextResponse.json({ success: true, id: updated.id, status: updated.status });
}
