import { describe, expect, it } from "vitest";
import {
  creditsForDurationMilli,
  ENGINE_CREDITS_PER_SECOND_MILLI,
  PLAN_CREDIT_LIMITS_MILLI,
} from "@/lib/heygen/credits";
import { VideoEngine, PlanType } from "@/app/generated/prisma/enums";

describe("creditsForDurationMilli", () => {
  it("computes millicredits for Avatar III at its documented rate", () => {
    expect(creditsForDurationMilli(VideoEngine.AVATAR_III, 10)).toBe(167);
  });

  it("computes millicredits for Avatar IV at its documented rate", () => {
    expect(creditsForDurationMilli(VideoEngine.AVATAR_IV, 10)).toBe(667);
  });

  it("computes millicredits for Avatar V at its documented rate", () => {
    expect(creditsForDurationMilli(VideoEngine.AVATAR_V, 10)).toBe(667);
  });

  it("handles fractional durations (matches HeyGen's real duration field, e.g. 4.91102s)", () => {
    const result = creditsForDurationMilli(VideoEngine.AVATAR_IV, 4.91102);
    expect(result).toBe(Math.round(4.91102 * 66.7));
  });

  it("returns 0 for zero duration", () => {
    expect(creditsForDurationMilli(VideoEngine.AVATAR_III, 0)).toBe(0);
  });

  it("Avatar IV and Avatar V share the same credit rate", () => {
    expect(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_IV).toBe(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_V);
  });

  it("Avatar III is the cheapest of the three engines in credits too", () => {
    expect(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_III).toBeLessThan(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_IV);
    expect(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_III).toBeLessThan(ENGINE_CREDITS_PER_SECOND_MILLI.AVATAR_V);
  });
});

describe("PLAN_CREDIT_LIMITS_MILLI", () => {
  it("FREE has no credit allowance (no live path to Avatar Studio on a bare FREE plan today)", () => {
    expect(PLAN_CREDIT_LIMITS_MILLI.FREE).toBe(0);
  });

  it("paid plans have a placeholder allowance high enough not to block real usage", () => {
    expect(PLAN_CREDIT_LIMITS_MILLI.CREATOR).toBeGreaterThan(0);
    expect(PLAN_CREDIT_LIMITS_MILLI.ENTERPRISE).toBeGreaterThan(0);
  });

  it("covers every PlanType value", () => {
    const values = Object.values(PlanType);
    for (const plan of values) {
      expect(PLAN_CREDIT_LIMITS_MILLI[plan]).toBeDefined();
    }
  });
});
