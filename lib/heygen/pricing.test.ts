import { describe, expect, it } from "vitest";
import { estimatedCostCents, ENGINE_RATE_USD_PER_SECOND, AVATAR_III_4K_RATE_USD_PER_SECOND } from "@/lib/heygen/pricing";
import { VideoEngine } from "@/app/generated/prisma/enums";

describe("estimatedCostCents", () => {
  it("computes cost for Avatar III at its measured rate", () => {
    // $0.012/sec x 10s = $0.12 -> 12 cents (rounded)
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10)).toBe(12);
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

  it("charges the 4K rate only for Avatar III with resolution 4k", () => {
    // 0.0277/sec x 10s = 0.277 -> 28 cents (rounded)
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10, "4k")).toBe(28);
  });

  it("falls back to the standard Avatar III rate for any other resolution", () => {
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10, "1080p")).toBe(12);
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10, null)).toBe(12);
    expect(estimatedCostCents(VideoEngine.AVATAR_III, 10)).toBe(12);
  });

  it("never applies the 4K rate to Avatar IV or V, even if resolution is somehow \"4k\"", () => {
    // Not documented as supported for these engines — falls back to their
    // own standard rate rather than silently using Avatar III's 4K price.
    expect(estimatedCostCents(VideoEngine.AVATAR_IV, 10, "4k")).toBe(67);
    expect(estimatedCostCents(VideoEngine.AVATAR_V, 10, "4k")).toBe(67);
  });

  it("4K is pricier per second than standard resolution on the same engine", () => {
    expect(AVATAR_III_4K_RATE_USD_PER_SECOND).toBeGreaterThan(ENGINE_RATE_USD_PER_SECOND.AVATAR_III);
  });
});
