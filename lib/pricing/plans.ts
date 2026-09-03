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

export const midMarketByTerm: Record<BillingTermKey, { avatars: string; priceDisplay: string }> = {
  MONTHLY_12: { avatars: "10 avatars", priceDisplay: "$2,499 p/m" },
  MONTHLY_24: { avatars: "5 avatars", priceDisplay: "$1,499 p/m" },
};

export const smallBusinessByTerm: Record<BillingTermKey, { avatars: string; priceDisplay: string }> = {
  MONTHLY_12: { avatars: "2 avatars", priceDisplay: "$899 p/m" },
  MONTHLY_24: { avatars: "3 avatars", priceDisplay: "$499 p/m" },
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
