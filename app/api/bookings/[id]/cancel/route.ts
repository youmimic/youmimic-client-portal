import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status === "cancelled") {
    return NextResponse.json(
      { error: "Booking is already cancelled" },
      { status: 409 },
    );
  }
  if (existing.status === "completed") {
    return NextResponse.json(
      { error: "Completed bookings cannot be cancelled" },
      { status: 409 },
    );
  }

  try {
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });

    revalidatePath("/dashboard/bookings");

    return NextResponse.json({ booking: updated });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
