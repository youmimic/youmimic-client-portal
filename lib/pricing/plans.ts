// Single source of truth for the public pricing tiers' real dollar amounts
// and avatar counts — shared by components/marketing/pricing-plans.tsx (the
// public pricing page) and app/(dashboard)/dashboard/checkout/page.tsx (the
// post-signup payment confirmation page), so a price can't drift between the
// two by being hand-copied in two places. Real, confirmed pricing (not
// placeholders) — see HANDOFF.md's marketing-site-rebuild session for
// provenance. Corporate is a flat monthly rate with no term/Stripe checkout
// (stays "Contact Sales" only); Mid Market and Small Business each have a
// distinct price/avatar-count per 12-month vs 24-month commitment term —
// keyed directly by the BillingTerm Prisma enum values so no translation
// layer is needed between the pricing page, the checkout API, and the DB.
export type BillingTermKey = "MONTHLY_12" | "MONTHLY_24";

export const corporate = {
  name: "Corporate",
  tagline: "For large organizations using AI avatars across every department.",
  priceDisplay: "$4,999 p/m",
  features: [
    "Unlimited avatars",
    "Priority video processing",
    "Brand governance controls",
    "Dedicated account manager",
  ],
};

// $99 AUD/month per avatar — same rate as STRIPE_AVATAR_STORAGE_PRICE_ID,
// charged as a second line item (quantity = chosen avatar count) on the
// same Stripe subscription as the platform fee below. See
// app/api/stripe/checkout-session/route.ts and the guest equivalent.
export const AVATAR_STORAGE_MONTHLY_CENTS = 9900;

// priceCents is the platform-fee portion only — avatars are billed
// separately on top (see AVATAR_STORAGE_MONTHLY_CENTS above), not bundled
// into this number. maxAvatars caps how many a buyer can select at
// checkout for this plan/term.
export const midMarketByTerm: Record<BillingTermKey, { maxAvatars: number; priceCents: number; priceDisplay: string }> = {
  MONTHLY_12: { maxAvatars: 10, priceCents: 249_900, priceDisplay: "$2,499 p/m" },
  MONTHLY_24: { maxAvatars: 5, priceCents: 149_900, priceDisplay: "$1,499 p/m" },
};

export const smallBusinessByTerm: Record<BillingTermKey, { maxAvatars: number; priceCents: number; priceDisplay: string }> = {
  MONTHLY_12: { maxAvatars: 2, priceCents: 89_900, priceDisplay: "$899 p/m" },
  MONTHLY_24: { maxAvatars: 3, priceCents: 49_900, priceDisplay: "$499 p/m" },
};

export const midMarket = {
  name: "Mid Market",
  tagline: "For growing teams scaling AI video communication across departments.",
  byTerm: midMarketByTerm,
};

export const smallBusiness = {
  name: "Small Business",
  tagline: "For individuals and focused teams getting started with AI video.",
  byTerm: smallBusinessByTerm,
};

export const TERM_LABEL: Record<BillingTermKey, string> = {
  MONTHLY_12: "12 months",
  MONTHLY_24: "24 months",
};

// Server- and client-safe: validates a chosen avatar count against the
// plan/term's own allowance. Used both for display (clamping the dropdown)
// and as the real server-side guard before ever creating a Stripe line
// item — the browser's count is never trusted on its own.
export function maxAvatarsFor(planType: "MID_MARKET" | "SMALL_BUSINESS", billingTerm: BillingTermKey): number {
  return planType === "MID_MARKET" ? midMarketByTerm[billingTerm].maxAvatars : smallBusinessByTerm[billingTerm].maxAvatars;
}

export function platformFeeCentsFor(planType: "MID_MARKET" | "SMALL_BUSINESS", billingTerm: BillingTermKey): number {
  return planType === "MID_MARKET" ? midMarketByTerm[billingTerm].priceCents : smallBusinessByTerm[billingTerm].priceCents;
}
