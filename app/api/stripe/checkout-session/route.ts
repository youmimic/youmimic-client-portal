import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";

const PLAN_PRICE_MAP = {
  CREATOR: process.env.STRIPE_CREATOR_PRICE_ID,
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID,
} as const;

const checkoutSchema = z.object({
  planType: z.enum(["CREATOR", "ENTERPRISE"]),
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { planType, enterpriseId } = parsed.data;

  if (planType === "ENTERPRISE") {
    if (!enterpriseId) {
      return NextResponse.json(
        { error: "enterpriseId is required for ENTERPRISE plan" },
        { status: 422 },
      );
    }
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
    });
    if (!enterprise) {
      return NextResponse.json({ error: "Enterprise not found" }, { status: 404 });
    }
    if (enterprise.ownerUserId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const priceId = PLAN_PRICE_MAP[planType];
  if (!priceId || priceId === "price_...") {
    return NextResponse.json(
      { error: "Plan price is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const existingSub =
      planType === "CREATOR"
        ? await prisma.subscription.findFirst({
            where: { userId: session.user.id, ownerType: "USER" },
          })
        : await prisma.subscription.findFirst({
            where: { enterpriseId, ownerType: "ENTERPRISE" },
          });

    let stripeCustomerId: string;

    if (existingSub?.stripeCustomerId) {
      stripeCustomerId = existingSub.stripeCustomerId;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata:
          planType === "CREATOR"
            ? { userId: session.user.id }
            : { enterpriseId: enterpriseId! },
      });
      stripeCustomerId = customer.id;

      await prisma.subscription.create({
        data: {
          ownerType: planType === "CREATOR" ? "USER" : "ENTERPRISE",
          userId: planType === "CREATOR" ? session.user.id : null,
          enterpriseId: planType === "ENTERPRISE" ? enterpriseId : null,
          stripeCustomerId,
          planType,
          status: "INCOMPLETE",
        },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?billing=success`,
      cancel_url: `${appUrl}/dashboard?billing=canceled`,
      metadata: {
        planType,
        userId: planType === "CREATOR" ? session.user.id : "",
        enterpriseId: planType === "ENTERPRISE" ? (enterpriseId ?? "") : "",
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
