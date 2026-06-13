import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";

const portalSchema = z.object({
  enterpriseId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = portalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { enterpriseId } = parsed.data;

  try {
    let stripeCustomerId: string | null = null;

    if (enterpriseId) {
      const enterprise = await prisma.enterprise.findUnique({
        where: { id: enterpriseId },
      });
      if (!enterprise) {
        return NextResponse.json({ error: "Enterprise not found" }, { status: 404 });
      }
      if (enterprise.ownerUserId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const sub = await prisma.subscription.findFirst({
        where: { enterpriseId, ownerType: "ENTERPRISE" },
        orderBy: { updatedAt: "desc" },
        select: { stripeCustomerId: true },
      });
      stripeCustomerId = sub?.stripeCustomerId ?? null;
    } else {
      const sub = await prisma.subscription.findFirst({
        where: { userId: session.user.id, ownerType: "USER" },
        orderBy: { updatedAt: "desc" },
        select: { stripeCustomerId: true },
      });
      stripeCustomerId = sub?.stripeCustomerId ?? null;
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Customer portal error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
