import { describe, expect, it } from "vitest";
import { gstBreakdownCents, formatGstBreakdown } from "@/lib/pricing/gst";

describe("gstBreakdownCents", () => {
  it("matches the $499 example from moneysmart.gov.au's GST calculator", () => {
    expect(gstBreakdownCents(49_900)).toEqual({ baseCents: 45_364, gstCents: 4_536 });
  });

  it("base + gst always add back up to the original total", () => {
    for (const totalCents of [9_900, 49_900, 89_900, 149_900, 249_900, 499_900]) {
      const { baseCents, gstCents } = gstBreakdownCents(totalCents);
      expect(baseCents + gstCents).toBe(totalCents);
    }
  });
});

describe("formatGstBreakdown", () => {
  it("formats as \"$base + $gst GST\"", () => {
    expect(formatGstBreakdown(49_900)).toBe("$453.64 + $45.36 GST");
  });
});
