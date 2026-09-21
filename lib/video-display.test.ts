import { describe, expect, it } from "vitest";
import { estimateGeneration, formatDuration, isInProgress, videoTitle, wordCount } from "@/lib/video-display";
import { generateVideoSchema } from "@/lib/validations/video";

describe("estimateGeneration", () => {
  it("returns zeros for an empty script", () => {
    const e = estimateGeneration("   ", "AVATAR_III");
    expect(e.durationSeconds).toBe(0);
    expect(e.credits).toBe(0);
    expect(e.costCents).toBe(0);
  });

  it("scales with script length and engine rate", () => {
    const script = Array.from({ length: 150 }, () => "word").join(" "); // 1 minute at 150 wpm
    const cheap = estimateGeneration(script, "AVATAR_III");
    const dear = estimateGeneration(script, "AVATAR_IV");
    expect(cheap.durationSeconds).toBeCloseTo(60);
    expect(dear.costCents).toBeGreaterThan(cheap.costCents);
    expect(cheap.waitMinutesHigh).toBeGreaterThanOrEqual(cheap.waitMinutesLow);
  });
});

describe("display helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("counts words", () => {
    expect(wordCount("  hello   there world ")).toBe(3);
  });

  it("falls back to the script when a video has no title", () => {
    expect(videoTitle({ title: "My video", script: "x" })).toBe("My video");
    expect(videoTitle({ title: null, script: "First line\nSecond" })).toBe("First line");
    expect(videoTitle({ title: null, script: "" })).toBe("Untitled video");
  });

  it("knows which statuses are in progress", () => {
    expect(isInProgress("PENDING")).toBe(true);
    expect(isInProgress("PROCESSING")).toBe(true);
    expect(isInProgress("COMPLETED")).toBe(false);
    expect(isInProgress("FAILED")).toBe(false);
  });
});

describe("generateVideoSchema", () => {
  it("still accepts the original script-only body", () => {
    const parsed = generateVideoSchema.safeParse({ script: "Hello" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.engine).toBe("avatar_iii");
  });

  it("accepts the new optional settings", () => {
    const parsed = generateVideoSchema.safeParse({
      script: "Hello",
      title: "Intro",
      aspectRatio: "9:16",
      resolution: "1080p",
      voiceId: "abc",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported formats", () => {
    expect(generateVideoSchema.safeParse({ script: "Hi", aspectRatio: "3:2" }).success).toBe(false);
    expect(generateVideoSchema.safeParse({ script: "Hi", resolution: "4k" }).success).toBe(false);
  });
});
