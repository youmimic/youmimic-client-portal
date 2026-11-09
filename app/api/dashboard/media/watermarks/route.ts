import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import prisma from "@/lib/prisma";

// A user's saved watermark library — see upload-watermark/route.ts for how
// rows are created, and [id]/route.ts for deletion.
export async function GET() {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const watermarks = await prisma.watermark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, createdAt: true },
  });

  return NextResponse.json({
    watermarks: watermarks.map((w) => ({ id: w.id, url: w.url, createdAt: w.createdAt.toISOString() })),
  });
}
