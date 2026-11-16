import { formatCents } from "@/lib/video-display";

// Australian GST, 10%. Every listed price in lib/pricing/plans.ts is
// GST-inclusive (the total itself never changes) — this only breaks out
// how much of that total is tax, the same backward calculation moneysmart.
// gov.au's GST calculator uses: base = total / 1.1, gst = total - base.
export const GST_RATE = 0.1;

export function gstBreakdownCents(totalCents: number): { baseCents: number; gstCents: number } {
  const baseCents = Math.round(totalCents / (1 + GST_RATE));
  return { baseCents, gstCents: totalCents - baseCents };
}

// e.g. "$453.64 + $45.36 GST" for a $499 total.
export function formatGstBreakdown(totalCents: number): string {
  const { baseCents, gstCents } = gstBreakdownCents(totalCents);
  return `${formatCents(baseCents)} + ${formatCents(gstCents)} GST`;
}
