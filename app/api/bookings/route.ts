import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createBookingSchema } from "@/lib/validations/booking";
import { addHoursToTime } from "@/lib/booking-time";
import { userHasActiveSubscription } from "@/lib/subscription";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fresh DB entitlement check — JWT state may be stale after Stripe events.
  const hasActiveSub = await userHasActiveSubscription(session.user.id);
  if (!hasActiveSub) {
    return NextResponse.json(
      { error: "An active subscription is required to create bookings" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);

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

    const booking = await prisma.booking.create({
      data: {
        userId: session.user.id,
        requestedDate: new Date(requestedDate),
        capturesCount,
        timeStart,
        timeEnd,
        notes: notes || null,
        participants: {
          create: participants.map((p, i) => ({
            sortOrder: i + 1,
            firstName: p.firstName,
            contactNumber: p.contactNumber,
          })),
        },
      },
    });

    revalidatePath("/dashboard/bookings");

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
