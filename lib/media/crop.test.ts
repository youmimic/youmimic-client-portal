import { describe, expect, it } from "vitest";
import { computeCropBox, parseAspectRatio } from "@/lib/media/crop";

describe("parseAspectRatio", () => {
  it("parses a valid W:H string", () => {
    expect(parseAspectRatio("16:9")).toBeCloseTo(16 / 9);
    expect(parseAspectRatio("9:16")).toBeCloseTo(9 / 16);
    expect(parseAspectRatio("1:1")).toBe(1);
  });

  it("returns null for anything else", () => {
    expect(parseAspectRatio("auto")).toBeNull();
    expect(parseAspectRatio("16/9")).toBeNull();
    expect(parseAspectRatio("")).toBeNull();
    expect(parseAspectRatio("0:9")).toBeNull();
  });
});

describe("computeCropBox", () => {
  it("crops the width when the source is wider than the target ratio, centered by default", () => {
    // 1600x900 (16:9) source, 1:1 target -> crop to 900x900, centered.
    const box = computeCropBox(1600, 900, 1, 0.5, 0.5);
    expect(box).toEqual({ left: 350, top: 0, width: 900, height: 900 });
  });

  it("crops the height when the source is taller than the target ratio", () => {
    // 900x1600 (9:16) source, 1:1 target -> crop to 900x900, centered.
    const box = computeCropBox(900, 1600, 1, 0.5, 0.5);
    expect(box).toEqual({ left: 0, top: 350, width: 900, height: 900 });
  });

  it("moves the crop window toward a non-center focal point", () => {
    // Focus near the top of a 1600x900 source cropped to 1:1 (900x900) —
    // ideal top would be negative, so it clamps to 0 instead of centering.
    const box = computeCropBox(1600, 900, 1, 0.5, 0.1);
    expect(box.top).toBe(0);
    expect(box.height).toBe(900);
  });

  it("clamps the crop window so it never runs past the source's edges", () => {
    // Focus pinned at the far right edge — crop window must still fit
    // entirely within the source, not overflow past it.
    const box = computeCropBox(1600, 900, 1, 1, 0.5);
    expect(box.left).toBe(1600 - 900);
    expect(box.left + box.width).toBeLessThanOrEqual(1600);
  });

  it("never upscales beyond the source's own dimensions", () => {
    const box = computeCropBox(500, 500, 16 / 9, 0.5, 0.5);
    expect(box.width).toBeLessThanOrEqual(500);
    expect(box.height).toBeLessThanOrEqual(500);
  });

  it("returns the full image when the source already matches the target ratio", () => {
    const box = computeCropBox(1920, 1080, 16 / 9, 0.5, 0.5);
    expect(box).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
  });
});
