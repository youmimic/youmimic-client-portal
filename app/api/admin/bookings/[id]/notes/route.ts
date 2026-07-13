import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageBookingNotes } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { addBookingNoteSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageBookingNotes(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = addBookingNoteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { note } = parsed.data;

  // Notes are append-only — no update/delete route exists, so the row
  // itself is the audit trail for its own content. writeAuditLog below is
  // for the cross-entity "Audit Log" view on the booking detail page, not a
  // duplicate of the note text.
  const created = await prisma.bookingNote.create({
    data: {
      bookingId,
      adminUserId: session.user.id,
      note,
    },
    select: {
      id: true,
      note: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "add_booking_note",
    entityType: ENTITY_TYPES.BOOKING,
    entityId: bookingId,
    metadata: { bookingNoteId: created.id },
  });

  return NextResponse.json(
    {
      note: {
        id: created.id,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        adminUser: created.adminUser,
      },
    },
    { status: 201 },
  );
}
