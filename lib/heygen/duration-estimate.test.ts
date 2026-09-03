import { describe, expect, it } from "vitest";
import { estimateDurationSeconds } from "@/lib/heygen/duration-estimate";

describe("estimateDurationSeconds", () => {
  it("returns 0 for an empty script", () => {
    expect(estimateDurationSeconds("")).toBe(0);
  });

  it("returns 0 for a whitespace-only script", () => {
    expect(estimateDurationSeconds("   \n\t  ")).toBe(0);
  });

  it("estimates ~4 seconds for 10 words at 150 wpm", () => {
    const script = Array.from({ length: 10 }, (_, i) => `word${i}`).join(" ");
    expect(estimateDurationSeconds(script)).toBeCloseTo(4, 1);
  });

  it("estimates 60 seconds for exactly 150 words", () => {
    const script = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ");
    expect(estimateDurationSeconds(script)).toBeCloseTo(60, 5);
  });

  it("collapses repeated whitespace rather than counting empty words", () => {
    const script = "one   two\nthree\t\tfour";
    expect(estimateDurationSeconds(script)).toBeCloseTo((4 / 150) * 60, 5);
  });
});
