// A pre-created Stripe Tax Rate object (10% GST, inclusive — see
// lib/pricing/gst.ts) attached to every checkout line item, so Stripe's own
// hosted checkout page and the invoices it generates show the GST
// breakdown, not just our own pricing/checkout pages. Not Stripe Tax
// (automatic_tax) — that needs an origin address configured and recalculates
// based on customer location, which doesn't fit a flat, always-inclusive-AU
// rate. A plain Tax Rate object keeps every invoice's total unchanged
// (inclusive) and just itemizes it, which is all that's being asked for.
// Optional by design: an unconfigured env var falls back to no tax_rates at
// all rather than breaking checkout, same pattern as the price-id env vars
// this file sits alongside.
export function gstTaxRates(): string[] | undefined {
  const id = process.env.STRIPE_GST_TAX_RATE_ID;
  return id && id !== "txr_..." ? [id] : undefined;
}
