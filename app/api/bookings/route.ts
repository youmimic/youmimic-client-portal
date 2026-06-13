import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createBookingSchema } from "@/lib/validations/booking";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const { requestedDate, timeStart, timeEnd, notes } = parsed.data;

    const booking = await prisma.booking.create({
      data: {
        userId: session.user.id,
        requestedDate: new Date(requestedDate),
        timeStart,
        timeEnd,
        notes: notes || null,
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
