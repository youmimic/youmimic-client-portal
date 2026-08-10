import Stripe from "stripe";

// Deliberately its own client, built from its own env var — not the shared
// `@/lib/stripe` client, which is test-mode and drives real
// checkout/webhooks/customer portal. This one is live-mode and, by the
// restricted key it's meant to be configured with, read-only on
// Subscriptions — nothing else in the app references STRIPE_MRR_LIVE_KEY.
// Built lazily inside fetchMrr() (not at module load) so a missing/rotated
// key degrades to the same "unavailable" result as any other Stripe failure
// rather than crashing at import time.
function mrrStripeClient(): Stripe | null {
  const key = process.env.STRIPE_MRR_LIVE_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// How many months one billing cycle spans, for normalizing any interval to
// a monthly figure. Week/day use the average month length (30.4375 days)
// rather than a fixed 4 or 30 — avoids a small systematic bias either way.
function monthsPerCycle(interval: string, intervalCount: number): number {
  switch (interval) {
    case "month":
      return intervalCount;
    case "year":
      return intervalCount * 12;
    case "week":
      return (intervalCount * 7) / 30.4375;
    case "day":
      return intervalCount / 30.4375;
    default:
      return intervalCount;
  }
}

export type MrrResult =
  | { ok: true; amountCents: number; currency: string; subscriptionCount: number }
  | { ok: false; error: string };

// Real, current MRR pulled live from Stripe — not the local Subscription
// mirror, which doesn't record interval/quantity precisely enough to
// normalize non-monthly plans and can drift from what Stripe actually has.
// Only counts `active` subscriptions (excludes trialing, past_due, canceled,
// incomplete — no committed recurring revenue yet, or no longer recurring).
// Never throws — a slow or failing Stripe call degrades to a visible
// "unavailable" state on the caller's side rather than breaking the whole
// overview page.
export async function fetchMrr(): Promise<MrrResult> {
  const stripe = mrrStripeClient();
  if (!stripe) {
    return { ok: false, error: "STRIPE_MRR_LIVE_KEY is not configured" };
  }

  try {
    const totalsByCurrency = new Map<string, { amountCents: number; subscriptionCount: number }>();

    for await (const subscription of stripe.subscriptions.list({ status: "active", limit: 100 })) {
      const currency = subscription.currency;
      const bucket = totalsByCurrency.get(currency) ?? { amountCents: 0, subscriptionCount: 0 };
      bucket.subscriptionCount += 1;

      for (const item of subscription.items.data) {
        const price = item.price;
        // Tiered/graduated prices have no flat unit_amount — skip rather
        // than guess; this app's real plans are all flat per-unit pricing.
        if (!price.recurring || price.unit_amount === null) continue;

        const quantity = item.quantity ?? 1;
        const lineAmount = price.unit_amount * quantity;
        const months = monthsPerCycle(price.recurring.interval, price.recurring.interval_count);
        bucket.amountCents += months > 0 ? lineAmount / months : lineAmount;
      }

      totalsByCurrency.set(currency, bucket);
    }

    if (totalsByCurrency.size === 0) {
      return { ok: true, amountCents: 0, currency: "aud", subscriptionCount: 0 };
    }

    // Multi-currency accounts: report whichever currency carries the most
    // revenue rather than naively summing incompatible currencies together.
    // This account's real subscriptions are single-currency (AUD) in
    // practice, so this is a safe fallback, not the common case.
    const [currency, totals] = [...totalsByCurrency.entries()].sort(
      (a, b) => b[1].amountCents - a[1].amountCents,
    )[0];

    return {
      ok: true,
      amountCents: Math.round(totals.amountCents),
      currency,
      subscriptionCount: totals.subscriptionCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
