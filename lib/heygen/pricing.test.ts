import { describe, expect, it } from "vitest";
import { estimatedCostCents, ENGINE_RATE_USD_PER_SECOND } from "@/lib/heygen/pricing";
import { VideoEngine } from "@/app/generated/prisma/enums";

describe("estimatedCostCents", () => {
  it("computes cost for Avatar III at its documented rate", () => {
    // $0.0167/sec x 10s = $0.167 -> 17 cents (rounded)
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10)).toBe(17);
  });

  it("computes cost for Avatar IV at its documented rate", () => {
    // $0.0667/sec x 10s = $0.667 -> 67 cents (rounded)
    expect(estimatedCostCents(VideoEngine.AVATAR_IV, 10)).toBe(67);
  });

  it("computes cost for Avatar V at its documented rate", () => {
    // $0.0667/sec x 10s = $0.667 -> 67 cents (rounded)
    expect(estimatedCostCents(VideoEngine.AVATAR_V, 10)).toBe(67);
  });

  it("handles fractional durations (matches HeyGen's real duration field, e.g. 4.91102s)", () => {
    const result = estimatedCostCents(VideoEngine.AVATAR_IV, 4.91102);
    // 4.91102 * 0.0667 = 0.327625... -> 33 cents (rounded)
    expect(result).toBe(33);
  });

  it("returns 0 for zero duration", () => {
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 0)).toBe(0);
  });

  it("Avatar IV and Avatar V share the same rate (both $0.0667/sec, per HeyGen's pricing docs)", () => {
    expect(ENGINE_RATE_USD_PER_SECOND.AVATAR_IV).toBe(ENGINE_RATE_USD_PER_SECOND.AVATAR_V);
  });

  it("Avatar III is the cheapest of the three engines", () => {
    expect(ENGINE_RATE_USD_PER_SECOND.AVATAR_III).toBeLessThan(ENGINE_RATE_USD_PER_SECOND.AVATAR_IV);
    expect(ENGINE_RATE_USD_PER_SECOND.AVATAR_III).toBeLessThan(ENGINE_RATE_USD_PER_SECOND.AVATAR_V);
  });
});
