import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";

// MID_MARKET/SMALL_BUSINESS both bill monthly regardless of the 12mo/24mo
// commitment term shown on the pricing page — the term only changes which
// price (monthly rate) applies, not the billing interval. See
// prisma/schema.prisma's BillingTerm enum comment.
function resolvePriceId(
  planType: "CREATOR" | "ENTERPRISE" | "MID_MARKET" | "SMALL_BUSINESS",
  billingTerm?: "MONTHLY_12" | "MONTHLY_24",
): string | undefined {
  switch (planType) {
    case "CREATOR":
      return process.env.STRIPE_CREATOR_PRICE_ID;
    case "ENTERPRISE":
      return process.env.STRIPE_ENTERPRISE_PRICE_ID;
    case "MID_MARKET":
      return billingTerm === "MONTHLY_24"
        ? process.env.STRIPE_MID_MARKET_24MO_PRICE_ID
        : process.env.STRIPE_MID_MARKET_12MO_PRICE_ID;
    case "SMALL_BUSINESS":
      return billingTerm === "MONTHLY_24"
        ? process.env.STRIPE_SMALL_BUSINESS_24MO_PRICE_ID
        : process.env.STRIPE_SMALL_BUSINESS_12MO_PRICE_ID;
  }
}

const checkoutSchema = z
  .object({
    planType: z.enum(["CREATOR", "ENTERPRISE", "MID_MARKET", "SMALL_BUSINESS"]),
    enterpriseId: z.string().optional(),
    billingTerm: z.enum(["MONTHLY_12", "MONTHLY_24"]).optional(),
  })
  .refine(
    (data) =>
      !(data.planType === "MID_MARKET" || data.planType === "SMALL_BUSINESS") ||
      data.billingTerm !== undefined,
    { message: "billingTerm is required for MID_MARKET and SMALL_BUSINESS", path: ["billingTerm"] },
  );

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

  const { planType, enterpriseId, billingTerm } = parsed.data;

  // MID_MARKET/SMALL_BUSINESS are personal (USER-owned) plans, same shape as
  // CREATOR — the marketing pricing page a self-serve visitor books from has
  // no notion of an Enterprise, and these tiers don't need one.
  const isPersonalPlan =
    planType === "CREATOR" || planType === "MID_MARKET" || planType === "SMALL_BUSINESS";

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

  if (isPersonalPlan) {
    const ownedEnterprise = await prisma.enterprise.findFirst({
      where: { ownerUserId: session.user.id },
      select: { id: true },
    });
    if (ownedEnterprise) {
      return NextResponse.json(
        { error: "Enterprise accounts cannot subscribe to personal plans" },
        { status: 403 },
      );
    }
  }

  const priceId = resolvePriceId(planType, billingTerm);
  if (!priceId || priceId === "price_...") {
    return NextResponse.json(
      { error: "Plan price is not configured" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    // billingComponent: STANDARD — must never reuse a Phase 1 avatar-billing
    // row's (PLATFORM_FEE / AVATAR_STORAGE) stripeCustomerId here.
    const existingSub = isPersonalPlan
      ? await prisma.subscription.findFirst({
          where: { userId: session.user.id, ownerType: "USER", billingComponent: "STANDARD" },
        })
      : await prisma.subscription.findFirst({
          where: { enterpriseId, ownerType: "ENTERPRISE", billingComponent: "STANDARD" },
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
        metadata: isPersonalPlan
          ? { userId: session.user.id }
          : { enterpriseId: enterpriseId! },
      });
      stripeCustomerId = customer.id;

      await prisma.subscription.create({
        data: {
          ownerType: isPersonalPlan ? "USER" : "ENTERPRISE",
          userId: isPersonalPlan ? session.user.id : null,
          enterpriseId: planType === "ENTERPRISE" ? enterpriseId : null,
          stripeCustomerId,
          planType,
          billingTerm,
          status: "INCOMPLETE",
        },
      });
    }

    // After checkout, send users to the session-refresh route so the JWT
    // is updated before they land on a subscription-gated page.
    // CREATOR plans go to bookings (the primary gated feature).
    // ENTERPRISE plans go to billing (subscription is B2B-managed, not user-facing gated).
    // MID_MARKET/SMALL_BUSINESS have no specific gated feature to send them
    // to the way CREATOR has bookings, so they land on the dashboard home.
    const redirectAfterCheckout =
      planType === "CREATOR"
        ? "/dashboard/bookings"
        : planType === "MID_MARKET" || planType === "SMALL_BUSINESS"
          ? "/dashboard"
          : "/dashboard/billing";

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard/checkout/success?redirect=${encodeURIComponent(redirectAfterCheckout)}`,
      cancel_url: `${appUrl}/dashboard/billing`,
      metadata: {
        planType,
        userId: isPersonalPlan ? session.user.id : "",
        enterpriseId: planType === "ENTERPRISE" ? (enterpriseId ?? "") : "",
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
