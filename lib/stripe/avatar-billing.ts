import type Stripe from "stripe";
import stripe from "@/lib/stripe";
import prisma from "@/lib/prisma";
import {
  BillingComponent,
  SubscriptionStatus,
  type PlanType,
} from "@/app/generated/prisma/enums";

const AVATAR_STORAGE_UNIT_AMOUNT_CENTS = 9900;
const AVATAR_STORAGE_CURRENCY = "AUD";

// Metadata key used to recognise an avatar-billing-setup Checkout Session in
// the webhook (app/api/stripe/webhook/route.ts) — distinct from every other
// session kind, which either carries a real subscription already (plan
// checkout) or a checkoutDraftId (guest checkout). Session metadata values
// must be strings, so avatarIds travels as a comma-joined list.
export const AVATAR_BILLING_SETUP_KIND = "avatar_storage_setup";

type ProvisionResult =
  | { ok: true; subscriptionId: string; stripeSubscriptionId: string }
  | {
      ok: false;
      code: "NOT_SELF_SERVE" | "NO_PAYMENT_METHOD" | "ALREADY_EXISTS" | "STRIPE_ERROR" | "NOT_FOUND";
      error: string;
    };

type CancelResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "STRIPE_ERROR"; error: string };

type SetupSessionResult =
  | { ok: true; url: string }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_EXISTS" | "STRIPE_ERROR"; error: string };

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

// Shared core: given a known Stripe customer + payment method, creates one
// avatar's independent $99 AUD/month Stripe Subscription and writes/updates
// its local row. Used by both provisionAvatarStorageSubscription (Phase 2
// self-serve, below) and provisionLegacyAvatarSubscriptions (the setup-mode
// Checkout flow for SALES_ASSISTED/legacy enterprises) — the only real
// difference between the two call sites is how the customer/payment method
// and planType are sourced, not how the Stripe subscription itself gets
// created.
async function createAvatarStripeSubscription(params: {
  enterpriseId: string;
  avatarId: string;
  stripeCustomerId: string;
  paymentMethodId: string;
  planType: PlanType;
}): Promise<ProvisionResult> {
  const { enterpriseId, avatarId, stripeCustomerId, paymentMethodId, planType } = params;

  const existing = await prisma.subscription.findUnique({
    where: { avatarId },
    select: { id: true, stripeSubscriptionId: true, provisioningFailedAt: true },
  });
  if (existing?.stripeSubscriptionId) {
    return { ok: false, code: "ALREADY_EXISTS", error: "This avatar already has a storage subscription." };
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
      planType,
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
    // stripeCustomerId is stored even on this failure path (not just on
    // success) — the retry cron (retry-failed-provisioning/route.ts) needs
    // it to know which customer/payment method to retry against for a
    // legacy enterprise, which has no STANDARD-plan row to re-resolve it
    // from the way Phase 2 self-serve can.
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { stripeCustomerId, provisioningFailedAt: new Date(), provisioningFailureMsg: message },
      });
    } else {
      await prisma.subscription.create({
        data: {
          enterpriseId,
          avatarId,
          ownerType: "ENTERPRISE",
          billingComponent: BillingComponent.AVATAR_STORAGE,
          billingProvider: "STRIPE",
          stripeCustomerId,
          unitAmountCents: AVATAR_STORAGE_UNIT_AMOUNT_CENTS,
          currency: AVATAR_STORAGE_CURRENCY,
          status: SubscriptionStatus.INCOMPLETE,
          planType,
          provisioningFailedAt: new Date(),
          provisioningFailureMsg: message,
        },
      });
    }

    return { ok: false, code: "STRIPE_ERROR", error: message };
  }
}

// Provisions a single, independent $99 AUD/month Stripe Subscription for one
// avatar. Only reachable for SELF_SERVE enterprises — SALES_ASSISTED
// enterprises keep using Phase 1's manual admin routes, or the setup-mode
// Checkout flow below, untouched.
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

  return createAvatarStripeSubscription({
    enterpriseId,
    avatarId,
    stripeCustomerId,
    paymentMethodId,
    // Preserves this function's existing (pre-existing, unchanged) behavior
    // — not touched by the LEGACY plan-type work, since Phase 2 self-serve
    // is for genuine self-serve customers, not manually-tracked legacy ones.
    planType: "ENTERPRISE",
  });
}

// One Stripe Checkout Session in "setup" mode (collects and saves a card,
// charges nothing) for a SALES_ASSISTED/legacy enterprise with no existing
// Stripe customer or payment method at all — Phase 2 self-serve above can't
// provision these, since resolveEnterpriseStripeCustomerId requires an
// existing real STANDARD-plan Stripe customer. Once the client completes
// it, the webhook (app/api/stripe/webhook/route.ts) calls
// provisionLegacyAvatarSubscriptions below to actually create each avatar's
// $99/month subscription using the card just saved.
export async function createAvatarBillingSetupSession(
  enterpriseId: string,
  avatarIds: string[],
): Promise<SetupSessionResult> {
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: {
      id: true,
      name: true,
      contacts: { where: { type: "BILLING" }, select: { email: true }, take: 1 },
    },
  });
  if (!enterprise) {
    return { ok: false, code: "NOT_FOUND", error: "Enterprise not found." };
  }

  const avatars = await prisma.avatar.findMany({
    where: { id: { in: avatarIds }, enterpriseId },
    select: { id: true, name: true, subscriptions: { select: { stripeSubscriptionId: true } } },
  });
  if (avatars.length !== avatarIds.length) {
    return { ok: false, code: "NOT_FOUND", error: "One or more avatars were not found on this enterprise." };
  }
  const alreadyBilled = avatars.find((a) => a.subscriptions.some((s) => s.stripeSubscriptionId));
  if (alreadyBilled) {
    return {
      ok: false,
      code: "ALREADY_EXISTS",
      error: `"${alreadyBilled.name}" already has a real Stripe storage subscription.`,
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const billingEmail = enterprise.contacts[0]?.email ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      ...(billingEmail ? { customer_email: billingEmail } : {}),
      success_url: `${appUrl}/billing-setup/complete`,
      cancel_url: `${appUrl}/billing-setup/complete?cancelled=1`,
      metadata: {
        kind: AVATAR_BILLING_SETUP_KIND,
        enterpriseId,
        avatarIds: avatarIds.join(","),
      },
    });
    if (!session.url) {
      return { ok: false, code: "STRIPE_ERROR", error: "Stripe did not return a checkout URL." };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return { ok: false, code: "STRIPE_ERROR", error: message };
  }
}

// Called from the webhook once the setup session above completes — creates
// one independent $99/month subscription per avatar using the card just
// saved, same core as Phase 2's provisionAvatarStorageSubscription but with
// a known customer/payment method (no existing STANDARD-plan subscription
// to resolve them from) and planType: LEGACY (see PlanType's schema
// comment — this is manually-tracked billing graduating to a real Stripe
// subscription, not a genuine self-serve Enterprise-tier purchase).
// For the daily retry cron (retry-failed-provisioning/route.ts): retries one
// legacy avatar's subscription using the stripeCustomerId already recorded
// on its (failed) row — see createAvatarStripeSubscription's failure path
// above for why that's always present. Re-resolves the payment method live
// rather than trusting a possibly-stale local copy, same as Phase 2.
export async function retryLegacyAvatarSubscription(
  enterpriseId: string,
  avatarId: string,
  stripeCustomerId: string,
): Promise<ProvisionResult> {
  const paymentMethodId = await resolveDefaultPaymentMethod(stripeCustomerId);
  if (!paymentMethodId) {
    return { ok: false, code: "NO_PAYMENT_METHOD", error: "No payment method on file for this customer." };
  }
  return createAvatarStripeSubscription({ enterpriseId, avatarId, stripeCustomerId, paymentMethodId, planType: "LEGACY" });
}

export async function provisionLegacyAvatarSubscriptions(
  enterpriseId: string,
  avatarIds: string[],
  stripeCustomerId: string,
  paymentMethodId: string,
): Promise<{ avatarId: string; result: ProvisionResult }[]> {
  const results: { avatarId: string; result: ProvisionResult }[] = [];
  for (const avatarId of avatarIds) {
    const result = await createAvatarStripeSubscription({
      enterpriseId,
      avatarId,
      stripeCustomerId,
      paymentMethodId,
      planType: "LEGACY",
    });
    results.push({ avatarId, result });
  }
  return results;
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
