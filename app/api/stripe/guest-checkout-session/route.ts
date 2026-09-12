import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";
import { resolveGuestPriceId } from "@/lib/checkout/create-draft";
import type { GuestCheckoutPlanType, GuestCheckoutBillingTerm } from "@/lib/validations/checkout-draft";

const bodySchema = z.object({
  draftId: z.string().min(1),
});

// Guest counterpart to app/api/stripe/checkout-session/route.ts — that route
// stays exactly as-is for authenticated CREATOR/ENTERPRISE/MID_MARKET/
// SMALL_BUSINESS checkouts. This one only ever runs off a server-created
// CheckoutDraft, so the browser can never influence the price, plan, or
// eligibility beyond having earlier passed lib/checkout/create-draft.ts's
// own validation.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const draft = await prisma.checkoutDraft.findUnique({
    where: { id: parsed.data.draftId },
  });

  if (!draft) {
    return NextResponse.json({ error: "Checkout session not found" }, { status: 404 });
  }

  // expiresAt is the 30-day data-retention deadline (see the schema comment
  // on CheckoutDraft.expiresAt), not a Stripe session TTL — Stripe's own
  // Checkout Session below is always freshly created on every call, so a
  // draft well past its original creation date can still resume right up
  // until this deadline. In practice, lib/checkout/process-draft-lifecycle.ts
  // deletes the row around the same time this would fire, so this is mostly
  // a defensive fallback for the gap between "past due" and "actually purged".
  if (draft.expiresAt < new Date()) {
    await prisma.checkoutDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json(
      { error: "This checkout session is no longer available. Please start again from the pricing page." },
      { status: 410 },
    );
  }

  if (draft.status !== "CREATED" && draft.status !== "OPEN") {
    return NextResponse.json(
      { error: "This checkout session can no longer be used." },
      { status: 409 },
    );
  }

  const priceId = resolveGuestPriceId(
    draft.planType as GuestCheckoutPlanType,
    draft.billingTerm as GuestCheckoutBillingTerm,
  );
  if (!priceId || priceId === "price_...") {
    return NextResponse.json(
      { error: "This plan is not currently available for purchase." },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    // A draft can be retried (e.g. the buyer went back after cancelling on
    // Stripe's page) — reuse the Stripe Customer already created for it
    // rather than creating a new one on every attempt.
    let stripeCustomerId = draft.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: draft.email,
        name: draft.fullName,
        metadata: { checkoutDraftId: draft.id },
      });
      stripeCustomerId = customer.id;
    }

    // Unlike the authenticated checkout route, we deliberately do NOT
    // pre-create a placeholder Subscription row here: "subscriptions"
    // has a DB check constraint requiring exactly one of userId/
    // enterpriseId to be set at all times (never both null), and no local
    // User exists yet for a guest. lib/checkout/activate-guest-account.ts
    // creates the Subscription row and the User together, atomically, once
    // the webhook confirms payment.
    const cancelUrl = new URL("/checkout", appUrl);
    cancelUrl.searchParams.set("plan", draft.planType);
    cancelUrl.searchParams.set("term", draft.billingTerm);
    cancelUrl.searchParams.set("draftId", draft.id);

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: draft.id,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl.toString(),
      metadata: {
        checkoutDraftId: draft.id,
        planType: draft.planType,
        billingTerm: draft.billingTerm,
      },
      subscription_data: {
        metadata: { checkoutDraftId: draft.id },
      },
    });

    await prisma.checkoutDraft.update({
      where: { id: draft.id },
      data: {
        status: "OPEN",
        stripeCustomerId,
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Guest checkout session error:", error);
    await prisma.checkoutDraft.update({
      where: { id: draft.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
