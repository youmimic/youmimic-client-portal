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
import { SYSTEM_EVENT_TYPE, SYSTEM_EVENT_LABEL } from "@/lib/stripe/system-event-types";
import {
  recordSystemEvent,
  resolveSubscriptionOwner,
  notifyBillingAdmins,
} from "@/lib/stripe/notifications";
import {
  sendSubscriptionStartedEmail,
  sendSubscriptionChangedEmail,
  sendPaymentFailedEmail,
} from "@/lib/mailer";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  CREATOR: "Creator",
  ENTERPRISE: "Enterprise",
};

function appUrl(): string {
  return process.env.BASE_URL ?? "http://localhost:3000";
}

// User-facing billing emails link to our own /dashboard/billing rather than
// a freshly-generated Stripe customer-portal URL — portal session URLs are
// short-lived/single-use, so embedding one directly in an email that might
// be opened days later would already be broken. The billing page's own
// "Manage billing" button (app/api/stripe/customer-portal/route.ts) creates
// a fresh session on click instead.
function billingUrl(): string {
  return `${appUrl()}/dashboard/billing`;
}

function adminActivityUrl(): string {
  return `${appUrl()}/admin/activity`;
}

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
  await recordSystemEvent({
    type: SYSTEM_EVENT_TYPE.AMBIGUOUS_INVOICE,
    source: "stripe_webhook",
    message: `${eventType}: could not resolve a single subscription for customer with multiple active subscriptions`,
    metadata: { invoiceId, stripeCustomerId: cid, eventType },
  });
}

// ---------------------------------------------------------------------------
// Notifications — record a SystemEvent and email the affected user + every
// BILLING_ADMIN+ admin. Email failures are caught and logged rather than
// rethrown: a Resend hiccup shouldn't turn an already-successful billing
// update into a 500 that makes Stripe retry the whole webhook (same
// tolerant-email pattern used elsewhere in this app, e.g.
// app/api/forgot-password/route.ts).
// ---------------------------------------------------------------------------

async function notifySubscriptionStarted(
  subscriptionId: string,
  planType: string,
  eventId: string,
) {
  const owner = await resolveSubscriptionOwner(subscriptionId);
  if (!owner) return;

  const planLabel = PLAN_LABELS[planType] ?? planType;

  await recordSystemEvent({
    type: SYSTEM_EVENT_TYPE.SUBSCRIPTION_STARTED,
    source: "stripe_webhook",
    message: `${planLabel} subscription started for ${owner.email}`,
    metadata: { subscriptionId, planType },
    userId: owner.userId,
    enterpriseId: owner.enterpriseId,
  });

  try {
    await sendSubscriptionStartedEmail({
      to: owner.email,
      name: owner.name ?? "there",
      planLabel,
      dashboardUrl: `${appUrl()}/dashboard`,
      idempotencyKey: `subscription-started/${eventId}`,
    });
  } catch (err) {
    console.error("subscription-started email failed:", err);
  }

  try {
    await notifyBillingAdmins({
      eventLabel: SYSTEM_EVENT_LABEL[SYSTEM_EVENT_TYPE.SUBSCRIPTION_STARTED],
      summary: `${owner.email} started a ${planLabel} subscription.`,
      detailsUrl: adminActivityUrl(),
      idempotencyKey: `admin-subscription-started/${eventId}`,
    });
  } catch (err) {
    console.error("admin subscription-started notification failed:", err);
  }
}

async function notifySubscriptionChanged(
  subscriptionId: string,
  planType: string,
  canceled: boolean,
  eventId: string,
) {
  const owner = await resolveSubscriptionOwner(subscriptionId);
  if (!owner) return;

  const planLabel = PLAN_LABELS[planType] ?? planType;
  const type = canceled
    ? SYSTEM_EVENT_TYPE.SUBSCRIPTION_CANCELED
    : SYSTEM_EVENT_TYPE.SUBSCRIPTION_UPDATED;

  await recordSystemEvent({
    type,
    source: "stripe_webhook",
    message: canceled
      ? `${planLabel} subscription canceled for ${owner.email}`
      : `${planLabel} subscription updated for ${owner.email}`,
    metadata: { subscriptionId, planType },
    userId: owner.userId,
    enterpriseId: owner.enterpriseId,
  });

  try {
    await sendSubscriptionChangedEmail({
      to: owner.email,
      name: owner.name ?? "there",
      planLabel,
      canceled,
      billingUrl: billingUrl(),
      idempotencyKey: `subscription-changed/${eventId}`,
    });
  } catch (err) {
    console.error("subscription-changed email failed:", err);
  }

  try {
    await notifyBillingAdmins({
      eventLabel: SYSTEM_EVENT_LABEL[type],
      summary: canceled
        ? `${owner.email}'s ${planLabel} subscription was canceled.`
        : `${owner.email}'s ${planLabel} subscription was updated.`,
      detailsUrl: adminActivityUrl(),
      idempotencyKey: `admin-subscription-changed/${eventId}`,
    });
  } catch (err) {
    console.error("admin subscription-changed notification failed:", err);
  }
}

async function notifyPaymentFailed(subscriptionId: string, eventId: string) {
  const owner = await resolveSubscriptionOwner(subscriptionId);
  if (!owner) return;

  await recordSystemEvent({
    type: SYSTEM_EVENT_TYPE.PAYMENT_FAILED,
    source: "stripe_webhook",
    message: `Payment failed for ${owner.email}`,
    metadata: { subscriptionId },
    userId: owner.userId,
    enterpriseId: owner.enterpriseId,
  });

  try {
    await sendPaymentFailedEmail({
      to: owner.email,
      name: owner.name ?? "there",
      portalUrl: billingUrl(),
      idempotencyKey: `payment-failed/${eventId}`,
    });
  } catch (err) {
    console.error("payment-failed email failed:", err);
  }

  try {
    await notifyBillingAdmins({
      eventLabel: SYSTEM_EVENT_LABEL[SYSTEM_EVENT_TYPE.PAYMENT_FAILED],
      summary: `A payment failed for ${owner.email}.`,
      detailsUrl: adminActivityUrl(),
      idempotencyKey: `admin-payment-failed/${eventId}`,
    });
  } catch (err) {
    console.error("admin payment-failed notification failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Handler helpers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
) {
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

  if (subId) {
    const updated = await prisma.subscription.findFirst({
      where: { stripeCustomerId: cid, stripeSubscriptionId: subId },
      select: { id: true },
    });
    if (updated) {
      await notifySubscriptionStarted(updated.id, planType, eventId);
    }
  }
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription, eventId: string) {
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

  // Fetched unconditionally (not just when canceled) — also needed below to
  // decide whether this update is notification-worthy.
  const local = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true, planType: true, billingComponent: true, avatarId: true },
  });

  // Phase 2 avatar billing: once Stripe confirms the subscription is
  // actually gone (not just scheduled via cancel_at_period_end), flip the
  // avatar to ARCHIVED. Done here rather than in the customer-initiated
  // cancel call so a subscription cancelled directly in Stripe (or one that
  // fails to renew) is reflected too, not just self-serve cancellations.
  if (
    sub.status === "canceled" &&
    local?.billingComponent === "AVATAR_STORAGE" &&
    local.avatarId
  ) {
    await prisma.avatar.update({
      where: { id: local.avatarId },
      data: { billingStatus: "ARCHIVED" },
    });
  }

  // Notify only for the primary plan subscription, not per-avatar
  // AVATAR_STORAGE add-ons — those change far more often and aren't really
  // "your subscription" from the user's perspective, so notifying on every
  // one would be noisy rather than useful.
  if (local && local.billingComponent === "STANDARD") {
    await notifySubscriptionChanged(
      local.id,
      local.planType,
      sub.status === "canceled",
      eventId,
    );
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

async function handleInvoiceFailed(invoice: Stripe.Invoice, eventId: string) {
  const cid = customerId(invoice.customer);
  if (!cid) return;

  const subId = invoiceSubscriptionId(invoice);

  if (!subId && (await countLiveSubscriptionsForCustomer(cid)) > 1) {
    await logAmbiguousInvoiceEvent("invoice.payment_failed", invoice.id ?? null, cid);
    return;
  }

  const where = subId
    ? { stripeSubscriptionId: subId }
    : { stripeCustomerId: cid, status: { not: SubscriptionStatus.CANCELED } };

  // Never mark an already-canceled row PAST_DUE, even in the unambiguous
  // (<=1 live subscription) case.
  await prisma.subscription.updateMany({
    where,
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  const updated = await prisma.subscription.findFirst({
    where,
    select: { id: true },
  });
  if (updated) {
    await notifyPaymentFailed(updated.id, eventId);
  }
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
          event.id,
        );
        break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
          event.id,
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice, event.id);
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
