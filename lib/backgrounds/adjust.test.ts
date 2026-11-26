import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/prisma", () => ({ default: {} }));
import {
  adjustKey,
  backgroundAdjustSchema,
  colourMatrix,
  DEFAULT_ADJUST,
  isDefaultAdjust,
  readAdjust,
  svgColourMatrixValues,
} from "@/lib/backgrounds/adjust";
import { applyBackgroundAdjust } from "@/lib/backgrounds/renditions";

// Real pixels through sharp: checks the server copy does what the sliders say.
const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 100 }).toBuffer();

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const near = (actual: number[], expected: number[], tolerance = 4) =>
  actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance));

describe("adjustment maths", () => {
  it("the default is the identity", () => {
    expect(isDefaultAdjust(DEFAULT_ADJUST)).toBe(true);
    expect(colourMatrix(DEFAULT_ADJUST).map((r) => r.map((v) => Number(v.toFixed(6))))).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("the browser preview gets the same matrix as the server", () => {
    const a = { darken: 30, warmth: 40, saturation: 80, blur: 2 };
    const values = svgColourMatrixValues(a).split(" ").map(Number);
    const m = colourMatrix(a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) expect(values[r * 5 + c]).toBeCloseTo(m[r][c], 4);
    expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it("validates ranges and reads stored values defensively", () => {
    expect(backgroundAdjustSchema.safeParse({ darken: 80, warmth: 0, saturation: 100, blur: 0 }).success).toBe(false);
    expect(backgroundAdjustSchema.safeParse({ darken: 10, warmth: 0, saturation: 100, blur: 0, extra: 1 }).success).toBe(false);
    expect(readAdjust({ darken: 20, warmth: 0, saturation: 100, blur: 0 })).toEqual({ darken: 20, warmth: 0, saturation: 100, blur: 0 });
    expect(readAdjust(DEFAULT_ADJUST)).toBeNull();
    expect(readAdjust("nonsense")).toBeNull();
    expect(adjustKey({ darken: 20, warmth: -5, saturation: 90, blur: 1.5 })).toBe("d20-w-5-s90-b1.5");
  });
});

describe("applyBackgroundAdjust (real pixels)", () => {
  it("darken is a black overlay: 50% halves every channel", async () => {
    const out = await applyBackgroundAdjust(await solid(64, 36, "#c8a078"), { ...DEFAULT_ADJUST, darken: 50 });
    near(await pixel(out, 32, 18), [100, 80, 60]);
  });

  it("warmth raises red and lowers blue (and cooler does the reverse)", async () => {
    const grey = await solid(64, 36, "#808080");
    const warm = await pixel(await applyBackgroundAdjust(grey, { ...DEFAULT_ADJUST, warmth: 100 }), 32, 18);
    const cool = await pixel(await applyBackgroundAdjust(grey, { ...DEFAULT_ADJUST, warmth: -100 }), 32, 18);
    expect(warm[0]).toBeGreaterThan(warm[2] + 40);
    expect(cool[2]).toBeGreaterThan(cool[0] + 40);
  });

  it("saturation 0 makes greyscale", async () => {
    const [r, g, b] = await pixel(await applyBackgroundAdjust(await solid(64, 36, "#e04020"), { ...DEFAULT_ADJUST, saturation: 0 }), 32, 18);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(3);
  });

  it("blur softens a hard edge, scaled to the image width", async () => {
    const half = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#000000" } })
      .composite([{ input: await solid(100, 100, "#ffffff"), left: 100, top: 0 }])
      .jpeg({ quality: 100 })
      .toBuffer();
    // blur 10 on a 200px-wide image is a radius (sigma) of 2px; 1px from the edge.
    const sharpEdge = await pixel(await applyBackgroundAdjust(half, DEFAULT_ADJUST), 99, 50);
    const blurred = await pixel(await applyBackgroundAdjust(half, { ...DEFAULT_ADJUST, blur: 10 }), 99, 50);
    expect(sharpEdge[0]).toBeLessThan(20);
    expect(blurred[0]).toBeGreaterThan(60);
  });

  it("keeps big photos bounded to 1920 on the long edge", async () => {
    const out = await applyBackgroundAdjust(await solid(3000, 2000, "#336699"), { ...DEFAULT_ADJUST, darken: 10 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1920, 1280, "jpeg"]);
  });
});
