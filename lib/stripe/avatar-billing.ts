import type Stripe from "stripe";
import stripe from "@/lib/stripe";
import prisma from "@/lib/prisma";
import {
  BillingComponent,
  SubscriptionStatus,
} from "@/app/generated/prisma/enums";

const AVATAR_STORAGE_UNIT_AMOUNT_CENTS = 9900;
const AVATAR_STORAGE_CURRENCY = "AUD";

type ProvisionResult =
  | { ok: true; subscriptionId: string; stripeSubscriptionId: string }
  | { ok: false; code: "NOT_SELF_SERVE" | "NO_PAYMENT_METHOD" | "ALREADY_EXISTS" | "STRIPE_ERROR"; error: string };

type CancelResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "STRIPE_ERROR"; error: string };

// STANDARD is the enterprise's actual paid-plan subscription, created at
// checkout time (app/api/stripe/checkout-session/route.ts) — it's the only
// Phase 1/2 row guaranteed to carry a real stripeCustomerId, since manually
// entered PLATFORM_FEE/AVATAR_STORAGE rows often don't. This is "the
// enterprise's Stripe customer" for provisioning purposes.
async function resolveEnterpriseStripeCustomerId(enterpriseId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { enterpriseId, ownerType: "ENTERPRISE", billingComponent: BillingComponent.STANDARD },
    orderBy: { updatedAt: "desc" },
    select: { stripeCustomerId: true },
  });
  return sub?.stripeCustomerId ?? null;
}

// Fetched live every time (no local caching) per confirmed design decision —
// a card the customer removed or replaced directly in Stripe must never be
// silently reused from a stale local copy.
async function resolveDefaultPaymentMethod(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted) {
    const defaultPm = customer.invoice_settings?.default_payment_method;
    const defaultPmId = typeof defaultPm === "string" ? defaultPm : defaultPm?.id;
    if (defaultPmId) return defaultPmId;
  }

  // No default set explicitly — fall back to any card attached to the
  // customer (e.g. one added via the billing portal that was never marked
  // default).
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return methods.data[0]?.id ?? null;
}

function periodFromItem(item: Stripe.SubscriptionItem | undefined) {
  return {
    start: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    end: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
  };
}

// Provisions a single, independent $99 AUD/month Stripe Subscription for one
// avatar. Only reachable for SELF_SERVE enterprises — SALES_ASSISTED
// enterprises keep using Phase 1's manual admin routes untouched.
export async function provisionAvatarStorageSubscription(
  enterpriseId: string,
  avatarId: string,
): Promise<ProvisionResult> {
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true, provisioningMode: true },
  });
  if (!enterprise || enterprise.provisioningMode !== "SELF_SERVE") {
    return { ok: false, code: "NOT_SELF_SERVE", error: "This enterprise is not set up for self-serve avatar billing." };
  }

  const existing = await prisma.subscription.findUnique({
    where: { avatarId },
    select: { id: true, stripeSubscriptionId: true, provisioningFailedAt: true },
  });
  if (existing?.stripeSubscriptionId) {
    return { ok: false, code: "ALREADY_EXISTS", error: "This avatar already has a storage subscription." };
  }

  const stripeCustomerId = await resolveEnterpriseStripeCustomerId(enterpriseId);
  if (!stripeCustomerId) {
    return {
      ok: false,
      code: "NO_PAYMENT_METHOD",
      error: "No Stripe customer found for this enterprise yet — subscribe to an Enterprise plan first.",
    };
  }

  const paymentMethodId = await resolveDefaultPaymentMethod(stripeCustomerId);
  if (!paymentMethodId) {
    return {
      ok: false,
      code: "NO_PAYMENT_METHOD",
      error: "No payment method on file. Add one via the billing portal before adding an avatar.",
    };
  }

  const priceId = process.env.STRIPE_AVATAR_STORAGE_PRICE_ID;
  if (!priceId) {
    return { ok: false, code: "STRIPE_ERROR", error: "Avatar storage price is not configured." };
  }

  try {
    const stripeSub = await stripe.subscriptions.create(
      {
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        metadata: { avatarId, enterpriseId },
      },
      { idempotencyKey: `avatar-storage-${avatarId}` },
    );

    const item = stripeSub.items.data[0];
    const { start, end } = periodFromItem(item);

    const data = {
      enterpriseId,
      avatarId,
      ownerType: "ENTERPRISE" as const,
      billingComponent: BillingComponent.AVATAR_STORAGE,
      billingProvider: "STRIPE" as const,
      stripeCustomerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: item?.price?.id ?? priceId,
      unitAmountCents: AVATAR_STORAGE_UNIT_AMOUNT_CENTS,
      currency: AVATAR_STORAGE_CURRENCY,
      status: SubscriptionStatus.ACTIVE,
      planType: "ENTERPRISE" as const,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      provisioningFailedAt: null,
      provisioningFailureMsg: null,
    };

    const subscription = existing
      ? await prisma.subscription.update({ where: { id: existing.id }, data })
      : await prisma.subscription.create({ data });

    await prisma.avatar.update({ where: { id: avatarId }, data: { billingStatus: "ACTIVE" } });

    return { ok: true, subscriptionId: subscription.id, stripeSubscriptionId: stripeSub.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";

    // Never leave the avatar silently unbilled — record the failure on a
    // (possibly newly created) placeholder row rather than swallowing it.
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { provisioningFailedAt: new Date(), provisioningFailureMsg: message },
      });
    } else {
      await prisma.subscription.create({
        data: {
          enterpriseId,
          avatarId,
          ownerType: "ENTERPRISE",
          billingComponent: BillingComponent.AVATAR_STORAGE,
          billingProvider: "STRIPE",
          unitAmountCents: AVATAR_STORAGE_UNIT_AMOUNT_CENTS,
          currency: AVATAR_STORAGE_CURRENCY,
          status: SubscriptionStatus.INCOMPLETE,
          planType: "ENTERPRISE",
          provisioningFailedAt: new Date(),
          provisioningFailureMsg: message,
        },
      });
    }

    return { ok: false, code: "STRIPE_ERROR", error: message };
  }
}

// Always cancels at period end, never immediately — consistent with Phase
// 1's pause-runs-through-period-end rule. Avatar.billingStatus is left as-is
// here; it flips to ARCHIVED only once the webhook confirms Stripe actually
// ended the subscription (see app/api/stripe/webhook/route.ts), so the UI
// never prematurely claims a still-paid-for period has stopped billing.
export async function cancelAvatarStorageSubscription(subscriptionId: string): Promise<CancelResult> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, billingComponent: true, stripeSubscriptionId: true },
  });
  if (!sub || sub.billingComponent !== BillingComponent.AVATAR_STORAGE || !sub.stripeSubscriptionId) {
    return { ok: false, code: "NOT_FOUND", error: "No active Stripe storage subscription found for this avatar." };
  }

  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return { ok: false, code: "STRIPE_ERROR", error: message };
  }
}
