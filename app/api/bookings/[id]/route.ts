import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { updateBookingSchema } from "@/lib/validations/booking";
import { addHoursToTime } from "@/lib/booking-time";
import { userHasActiveSubscription } from "@/lib/subscription";

const EDITABLE_STATUSES = ["pending", "confirmed"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fresh DB entitlement check — JWT state may be stale after Stripe events.
  const hasActiveSub = await userHasActiveSubscription(session.user.id);
  if (!hasActiveSub) {
    return NextResponse.json(
      { error: "An active subscription is required to edit bookings" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json(
      { error: "This booking cannot be edited" },
      { status: 409 },
    );
  }

  try {
    const body = await req.json();
    const parsed = updateBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { requestedDate, capturesCount, timeStart, notes, participants } =
      parsed.data;

    // Always compute timeEnd server-side — never trust the client-submitted value.
    const timeEnd = addHoursToTime(timeStart, capturesCount);

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        requestedDate: new Date(requestedDate),
        capturesCount,
        timeStart,
        timeEnd,
        notes: notes || null,
        participants: {
          // Replace all participants atomically.
          deleteMany: {},
          create: participants.map((p, i) => ({
            sortOrder: i + 1,
            firstName: p.firstName,
            contactNumber: p.contactNumber,
          })),
        },
      },
    });

    revalidatePath("/dashboard/bookings");

    return NextResponse.json({ booking: updated });
  } catch (error) {
    console.error("Update booking error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
