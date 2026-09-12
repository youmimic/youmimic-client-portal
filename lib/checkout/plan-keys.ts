import { midMarket, smallBusiness, type BillingTermKey } from "@/lib/pricing/plans";

// Shared plan-key types/guards for both checkout review pages
// (app/checkout, app/(dashboard)/dashboard/checkout) and their server-side
// query-param validation. Kept in a plain (non "use client") module so
// Server Components can call the type guards directly — importing them
// from components/checkout/plan-term-fields.tsx would fail at runtime
// since everything exported from a "use client" module is only invocable
// from a Client Component, never from a Server Component.
export const CHECKOUT_PLANS = { MID_MARKET: midMarket, SMALL_BUSINESS: smallBusiness } as const;
export type CheckoutPlanKey = keyof typeof CHECKOUT_PLANS;

export function isCheckoutPlanKey(value: string | undefined): value is CheckoutPlanKey {
  return value === "MID_MARKET" || value === "SMALL_BUSINESS";
}

export function isBillingTermKey(value: string | undefined): value is BillingTermKey {
  return value === "MONTHLY_12" || value === "MONTHLY_24";
}
