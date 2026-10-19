import { describe, expect, it } from "vitest";
import { maxAvatarsFor, platformFeeCentsFor, midMarketByTerm, smallBusinessByTerm } from "@/lib/pricing/plans";

describe("maxAvatarsFor", () => {
  it("matches the Mid Market allowance per term", () => {
    expect(maxAvatarsFor("MID_MARKET", "MONTHLY_12")).toBe(10);
    expect(maxAvatarsFor("MID_MARKET", "MONTHLY_24")).toBe(5);
  });

  it("matches the Small Business allowance per term", () => {
    expect(maxAvatarsFor("SMALL_BUSINESS", "MONTHLY_12")).toBe(2);
    expect(maxAvatarsFor("SMALL_BUSINESS", "MONTHLY_24")).toBe(3);
  });

  it("stays in sync with the underlying tier tables (no hand-copied drift)", () => {
    for (const term of ["MONTHLY_12", "MONTHLY_24"] as const) {
      expect(maxAvatarsFor("MID_MARKET", term)).toBe(midMarketByTerm[term].maxAvatars);
      expect(maxAvatarsFor("SMALL_BUSINESS", term)).toBe(smallBusinessByTerm[term].maxAvatars);
    }
  });
});

describe("platformFeeCentsFor", () => {
  it("returns the platform-fee portion only, not avatars bundled in", () => {
    expect(platformFeeCentsFor("MID_MARKET", "MONTHLY_12")).toBe(249_900);
    expect(platformFeeCentsFor("SMALL_BUSINESS", "MONTHLY_24")).toBe(49_900);
  });
});
