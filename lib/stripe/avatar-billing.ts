import type Stripe from "stripe";
import stripe from "@/lib/stripe";
import prisma from "@/lib/prisma";
import {
  BillingComponent,
  BillingInterval,
  SubscriptionStatus,
  type PlanType,
} from "@/app/generated/prisma/enums";

function mapRecurringInterval(interval: Stripe.Price.Recurring.Interval): BillingInterval {
  // "day"/"week" aren't real scenarios this app supports (avatar storage is
  // only ever monthly or yearly) — default to MONTH defensively rather than
  // throw, since this is a live-fetched value whose shape isn't under this
  // app's control.
  return interval === "year" ? BillingInterval.YEAR : BillingInterval.MONTH;
}

type ResolvedPrice = { unitAmountCents: number; currency: string; billingInterval: BillingInterval };

// Fetched live, never cached — the whole point is to reflect whatever price
// object actually exists in Stripe right now, not a locally-assumed amount.
// Rejects anything that isn't a real, active, recurring price so a typo'd
// or one-off price id fails fast with a clear reason instead of silently
// billing the wrong amount or interval.
async function resolveAndValidatePrice(priceId: string): Promise<{ ok: true; price: ResolvedPrice } | { ok: false; error: string }> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active) {
      return { ok: false, error: "This Stripe price is not active." };
    }
    if (!price.recurring || price.unit_amount == null) {
      return { ok: false, error: "This Stripe price is not a recurring price with a fixed amount." };
    }
    return {
      ok: true,
      price: {
        unitAmountCents: price.unit_amount,
        currency: price.currency.toUpperCase(),
        billingInterval: mapRecurringInterval(price.recurring.interval),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return { ok: false, error: `Could not find that Stripe price: ${message}` };
  }
}

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

// Shared core: given a known Stripe customer + payment method + price,
// creates one avatar's independent Stripe Subscription and writes/updates
// its local row. Used by both provisionAvatarStorageSubscription (Phase 2
// self-serve, below) and provisionLegacyAvatarSubscriptions (the setup-mode
// Checkout flow for SALES_ASSISTED/legacy enterprises) — the only real
// difference between the two call sites is how the customer/payment method
// and planType are sourced, not how the Stripe subscription itself gets
// created. The price is always resolved live (never hardcoded), so this
// works for any real recurring price — monthly, yearly, or otherwise —
// not just the original $99/month avatar-storage default.
async function createAvatarStripeSubscription(params: {
  enterpriseId: string;
  avatarId: string;
  stripeCustomerId: string;
  paymentMethodId: string;
  planType: PlanType;
  priceId: string;
}): Promise<ProvisionResult> {
  const { enterpriseId, avatarId, stripeCustomerId, paymentMethodId, planType, priceId } = params;

  const existing = await prisma.subscription.findUnique({
    where: { avatarId },
    select: { id: true, stripeSubscriptionId: true, provisioningFailedAt: true },
  });
  if (existing?.stripeSubscriptionId) {
    return { ok: false, code: "ALREADY_EXISTS", error: "This avatar already has a storage subscription." };
  }

  const resolvedPrice = await resolveAndValidatePrice(priceId);
  if (!resolvedPrice.ok) {
    return { ok: false, code: "STRIPE_ERROR", error: resolvedPrice.error };
  }
  const { unitAmountCents, currency, billingInterval } = resolvedPrice.price;

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
      stripePriceId: priceId,
      unitAmountCents,
      currency,
      billingInterval,
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
    // stripeCustomerId and stripePriceId are stored even on this failure
    // path (not just on success) — the retry cron
    // (retry-failed-provisioning/route.ts) needs both to know which
    // customer/payment method/price to retry against for a legacy
    // enterprise, which has no STANDARD-plan row to re-resolve a customer
    // from the way Phase 2 self-serve can, and no env default price to fall
    // back on once a custom one (like a yearly price) was actually used.
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          stripeCustomerId,
          stripePriceId: priceId,
          unitAmountCents,
          currency,
          billingInterval,
          provisioningFailedAt: new Date(),
          provisioningFailureMsg: message,
        },
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
          stripePriceId: priceId,
          unitAmountCents,
          currency,
          billingInterval,
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

  const priceId = process.env.STRIPE_AVATAR_STORAGE_PRICE_ID;
  if (!priceId) {
    return { ok: false, code: "STRIPE_ERROR", error: "Avatar storage price is not configured." };
  }

  return createAvatarStripeSubscription({
    enterpriseId,
    avatarId,
    stripeCustomerId,
    paymentMethodId,
    priceId,
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
// subscription using the card just saved.
//
// Resolves which price id to actually use: an explicit custom price id
// wins if given (a genuine one-off deal); otherwise billingInterval picks
// between the two standard, named "Avatar Storage Subscription" prices —
// MONTH (the original $99/month default) or YEAR ($1,188/year, same
// per-avatar rate x12, added once a second legacy client needed it). Both
// are real, reusable options for any future client on that billing term,
// not something tied to whichever client first needed yearly.
function resolveStandardOrCustomPriceId(opts: { stripePriceId?: string; billingInterval?: "MONTH" | "YEAR" }): string | undefined {
  if (opts.stripePriceId) return opts.stripePriceId;
  if (opts.billingInterval === "YEAR") return process.env.STRIPE_AVATAR_STORAGE_YEARLY_PRICE_ID;
  return process.env.STRIPE_AVATAR_STORAGE_PRICE_ID;
}

// stripePriceId/billingInterval both optional — omitted entirely, this
// falls back to the original $99/month avatar-storage price (D2 Legal's
// case). Pass billingInterval: "YEAR" for the standard yearly option, or a
// specific stripePriceId for a genuine one-off custom deal. Verified here,
// live, before the link is ever generated, so an admin gets an immediate,
// clear error for a mistyped/inactive price instead of a silently-broken
// link sent to a real client.
export async function createAvatarBillingSetupSession(
  enterpriseId: string,
  avatarIds: string[],
  opts: { stripePriceId?: string; billingInterval?: "MONTH" | "YEAR" } = {},
): Promise<SetupSessionResult> {
  const priceId = resolveStandardOrCustomPriceId(opts);
  if (!priceId) {
    return { ok: false, code: "STRIPE_ERROR", error: "No Stripe price given, and no matching default avatar storage price is configured." };
  }
  const resolvedPrice = await resolveAndValidatePrice(priceId);
  if (!resolvedPrice.ok) {
    return { ok: false, code: "STRIPE_ERROR", error: resolvedPrice.error };
  }

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
        stripePriceId: priceId,
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
// one independent subscription per avatar (at whatever price the session
// was created with) using the card just saved, same core as Phase 2's
// provisionAvatarStorageSubscription but with a known customer/payment
// method (no existing STANDARD-plan subscription to resolve them from) and
// planType: LEGACY (see PlanType's schema comment — this is
// manually-tracked billing graduating to a real Stripe subscription, not a
// genuine self-serve Enterprise-tier purchase).
// For the daily retry cron (retry-failed-provisioning/route.ts): retries one
// legacy avatar's subscription using the stripeCustomerId and stripePriceId
// already recorded on its (failed) row — see createAvatarStripeSubscription's
// failure path above for why both are always present. Re-resolves the
// payment method live rather than trusting a possibly-stale local copy,
// same as Phase 2.
export async function retryLegacyAvatarSubscription(
  enterpriseId: string,
  avatarId: string,
  stripeCustomerId: string,
  priceId: string,
): Promise<ProvisionResult> {
  const paymentMethodId = await resolveDefaultPaymentMethod(stripeCustomerId);
  if (!paymentMethodId) {
    return { ok: false, code: "NO_PAYMENT_METHOD", error: "No payment method on file for this customer." };
  }
  return createAvatarStripeSubscription({ enterpriseId, avatarId, stripeCustomerId, paymentMethodId, priceId, planType: "LEGACY" });
}

export async function provisionLegacyAvatarSubscriptions(
  enterpriseId: string,
  avatarIds: string[],
  stripeCustomerId: string,
  paymentMethodId: string,
  priceId: string,
): Promise<{ avatarId: string; result: ProvisionResult }[]> {
  const results: { avatarId: string; result: ProvisionResult }[] = [];
  for (const avatarId of avatarIds) {
    const result = await createAvatarStripeSubscription({
      enterpriseId,
      avatarId,
      stripeCustomerId,
      paymentMethodId,
      priceId,
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
