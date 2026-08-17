import { NextResponse } from "next/server";
import type Stripe from "stripe";
import stripeClient from "@/lib/stripe";
import prisma from "@/lib/prisma";
import {
  PaymentStatus,
  PaymentType,
  PlanType,
  SubscriptionStatus,
} from "@/app/generated/prisma/enums";

// Maps Stripe subscription.status to our DB SubscriptionStatus enum
const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  canceled: SubscriptionStatus.CANCELED,
  paused: SubscriptionStatus.PAUSED,
};

// Exported for direct unit testing (app/api/stripe/webhook/route.test.ts) —
// these encode real business rules (status mapping, plan-type fallback)
// that silently break in a way that's hard to notice if Stripe's API shape
// or a test-mode metadata field ever changes.
export function toStatus(stripeStatus: string): SubscriptionStatus {
  return STRIPE_STATUS_MAP[stripeStatus] ?? SubscriptionStatus.INCOMPLETE;
}

export function toPlanType(raw: string | undefined): PlanType {
  if (raw === PlanType.CREATOR) return PlanType.CREATOR;
  if (raw === PlanType.ENTERPRISE) return PlanType.ENTERPRISE;
  return PlanType.CREATOR;
}

export function customerId(
  val: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!val) return null;
  return typeof val === "string" ? val : val.id;
}

// A Stripe customer can hold more than one concurrent subscription (a base
// plan plus a separate seats add-on, for example), so stripeCustomerId alone
// is not enough to identify which local row a webhook event is about —
// every handler below resolves the specific stripeSubscriptionId first and
// only falls back to stripeCustomerId for the still-unlinked placeholder row
// created at checkout time (see app/api/stripe/checkout-session/route.ts).
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details?.subscription;
  if (!details) return null;
  return typeof details === "string" ? details : details.id;
}

// Phase 2 avatar billing broke the one-customer-one-subscription assumption
// the stripeCustomerId fallback above relied on: a self-serve enterprise's
// Stripe customer can hold a STANDARD plan subscription plus several
// AVATAR_STORAGE subscriptions at once. When an invoice event's own
// subscription id can't be resolved, this checks whether the customer-wide
// fallback would actually be unambiguous before using it. Not restricted to
// rows with a stripeSubscriptionId — an INCOMPLETE placeholder row (no id
// yet) is still a live candidate the blanket fallback could hit.
async function countLiveSubscriptionsForCustomer(cid: string): Promise<number> {
  return prisma.subscription.count({
    where: { stripeCustomerId: cid, status: { not: SubscriptionStatus.CANCELED } },
  });
}

async function logAmbiguousInvoiceEvent(eventType: string, invoiceId: string | null, cid: string) {
  console.error(`Ambiguous ${eventType} for customer ${cid} (invoice ${invoiceId}) — has multiple active subscriptions, no subscription id on the invoice. Skipped fallback update; needs manual review.`);
  await prisma.systemEvent.create({
    data: {
      type: "stripe_webhook_ambiguous_invoice",
      source: "stripe_webhook",
      message: `${eventType}: could not resolve a single subscription for customer with multiple active subscriptions`,
      metadata: { invoiceId, stripeCustomerId: cid, eventType },
    },
  });
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const cid = customerId(session.customer);
  if (!cid) return;

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  const planType = toPlanType(session.metadata?.planType);

  await prisma.subscription.updateMany({
    where: {
      stripeCustomerId: cid,
      OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: subId }],
    },
    data: {
      stripeSubscriptionId: subId ?? undefined,
      planType,
      status: SubscriptionStatus.ACTIVE,
    },
  });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const cid = customerId(sub.customer);
  if (!cid) return;

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const productVal = item?.price?.product;
  const productId =
    typeof productVal === "string"
      ? productVal
      : ((productVal as Stripe.Product | null)?.id ?? null);

  // In Stripe v22 current_period_* moved to the subscription item level
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const data = {
    stripeSubscriptionId: sub.id,
    status: toStatus(sub.status),
    stripePriceId: priceId,
    stripeProductId: productId,
    currentPeriodStart: periodStart ?? undefined,
    currentPeriodEnd: periodEnd ?? undefined,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt,
    trialEndsAt,
  };

  const matched = await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data,
  });

  // Not linked locally yet (e.g. first activation) — claim the still-unlinked
  // placeholder row for this customer instead of matching every row it owns.
  if (matched.count === 0) {
    await prisma.subscription.updateMany({
      where: { stripeCustomerId: cid, stripeSubscriptionId: null },
      data,
    });
  }

  // Phase 2 avatar billing: once Stripe confirms the subscription is
  // actually gone (not just scheduled via cancel_at_period_end), flip the
  // avatar to ARCHIVED. Done here rather than in the customer-initiated
  // cancel call so a subscription cancelled directly in Stripe (or one that
  // fails to renew) is reflected too, not just self-serve cancellations.
  if (sub.status === "canceled") {
    const local = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
      select: { avatarId: true, billingComponent: true },
    });
    if (local?.billingComponent === "AVATAR_STORAGE" && local.avatarId) {
      await prisma.avatar.update({
        where: { id: local.avatarId },
        data: { billingStatus: "ARCHIVED" },
      });
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const cid = customerId(invoice.customer);
  if (!cid) return;

  const subId = invoiceSubscriptionId(invoice);

  if (!subId && (await countLiveSubscriptionsForCustomer(cid)) > 1) {
    await logAmbiguousInvoiceEvent("invoice.payment_succeeded", invoice.id ?? null, cid);
    return;
  }

  // Never attach a payment to an already-canceled row, even in the
  // unambiguous (<=1 live subscription) case.
  const localSub = await prisma.subscription.findFirst({
    where: subId
      ? { stripeSubscriptionId: subId }
      : { stripeCustomerId: cid, status: { not: SubscriptionStatus.CANCELED } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!localSub) return;

  await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {},
    create: {
      type: PaymentType.subscription,
      subscriptionId: localSub.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: PaymentStatus.paid,
    },
  });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const cid = customerId(invoice.customer);
  if (!cid) return;

  const subId = invoiceSubscriptionId(invoice);

  if (!subId && (await countLiveSubscriptionsForCustomer(cid)) > 1) {
    await logAmbiguousInvoiceEvent("invoice.payment_failed", invoice.id ?? null, cid);
    return;
  }

  // Never mark an already-canceled row PAST_DUE, even in the unambiguous
  // (<=1 live subscription) case.
  await prisma.subscription.updateMany({
    where: subId
      ? { stripeSubscriptionId: subId }
      : { stripeCustomerId: cid, status: { not: SubscriptionStatus.CANCELED } },
    data: { status: SubscriptionStatus.PAST_DUE },
  });
}

// ---------------------------------------------------------------------------
// Route handler — must receive raw body for Stripe signature verification
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret === "whsec_...") {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unrecognised event — return 200 so Stripe does not retry
        break;
    }
  } catch (err) {
    console.error(`Error processing Stripe event ${event.type}:`, err);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
