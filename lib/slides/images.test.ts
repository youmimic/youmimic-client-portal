import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// These functions are pure image processing; the module just imports the
// database client for its storage helpers.
vi.mock("@/lib/prisma", () => ({ default: {} }));
import {
  letterboxSlide,
  normaliseSlideImage,
  SLIDE_MAX_EDGE,
  SLIDE_RETENTION_AFTER_RENDER_MS,
  SlideImageError,
  slideImageExpiredByRenders,
} from "@/lib/slides/images";

// Real images through sharp, no mocks: checks the actual pixels.
const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("letterboxSlide", () => {
  it("pads a 4:3 slide to a 16:9 canvas with black bars, never cropping it", async () => {
    const out = await letterboxSlide(await solid(800, 600, "#ffffff"), "16:9");
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1920, 1080]);
    expect((await pixel(out, 5, 540)).every((c) => c < 20)).toBe(true); // left bar
    expect((await pixel(out, 1914, 540)).every((c) => c < 20)).toBe(true); // right bar
    expect((await pixel(out, 960, 5)).every((c) => c > 235)).toBe(true); // slide reaches the top
    expect((await pixel(out, 960, 1074)).every((c) => c > 235)).toBe(true); // and the bottom
  });

  it("fits a landscape slide into a portrait video with bars above and below", async () => {
    const out = await letterboxSlide(await solid(1600, 900, "#ffffff"), "9:16");
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
    expect((await pixel(out, 540, 10)).every((c) => c < 20)).toBe(true);
    expect((await pixel(out, 540, 960)).every((c) => c > 235)).toBe(true);
  });
});

describe("normaliseSlideImage", () => {
  it("bounds the longest edge and keeps the aspect ratio", async () => {
    const out = await normaliseSlideImage(await solid(4000, 3000, "#123456"));
    expect(out.width).toBe(SLIDE_MAX_EDGE);
    expect(out.height).toBe(1440);
    expect((await sharp(out.buffer).metadata()).format).toBe("jpeg");
  });

  it("never enlarges a small image", async () => {
    const out = await normaliseSlideImage(await solid(640, 360, "#ffffff"));
    expect([out.width, out.height]).toEqual([640, 360]);
  });

  it("rejects data that isn't an image", async () => {
    await expect(normaliseSlideImage(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(SlideImageError);
  });
});

describe("slideImageExpiredByRenders", () => {
  const now = new Date("2026-11-25T04:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const DAY = SLIDE_RETENTION_AFTER_RENDER_MS;
  const urls = ["https://blob/original.jpg", "https://blob/16x9.jpg"];
  const render = (over: Partial<{ status: string; createdAt: Date; completedAt: Date | null; url: string }>) => ({
    status: over.status ?? "COMPLETED",
    createdAt: over.createdAt ?? ago(DAY + 3_600_000),
    completedAt: over.completedAt === undefined ? ago(DAY + 60_000) : over.completedAt,
    sceneSnapshot: [
      { order: 1, kind: "AVATAR", mediaUrl: null },
      { order: 2, kind: "SLIDE", mediaUrl: over.url ?? urls[1] },
    ],
  });

  it("expires once the only render showing it finished over a day ago", () => {
    expect(slideImageExpiredByRenders(urls, [render({})], now)).toBe(true);
  });

  it("keeps images no render has shown", () => {
    expect(slideImageExpiredByRenders(urls, [], now)).toBe(false);
    expect(slideImageExpiredByRenders(urls, [render({ url: "https://blob/other.jpg" })], now)).toBe(false);
  });

  it("keeps it for a day after a recent finish", () => {
    expect(slideImageExpiredByRenders(urls, [render({ createdAt: ago(7_200_000), completedAt: ago(3_600_000) })], now)).toBe(false);
  });

  it("restarts the clock when rendered again, whether running, failed or finished", () => {
    const old = render({});
    expect(slideImageExpiredByRenders(urls, [old, render({ status: "PROCESSING", createdAt: ago(DAY * 3), completedAt: null })], now)).toBe(false);
    expect(slideImageExpiredByRenders(urls, [old, render({ status: "FAILED", createdAt: ago(3_600_000), completedAt: null })], now)).toBe(false);
    expect(slideImageExpiredByRenders(urls, [old, render({ createdAt: ago(7_200_000), completedAt: ago(3_600_000) })], now)).toBe(false);
  });

  it("never expires on an old failed render alone, and matches the original URL too", () => {
    expect(slideImageExpiredByRenders(urls, [render({ status: "FAILED", completedAt: null })], now)).toBe(false);
    expect(slideImageExpiredByRenders(urls, [render({ url: urls[0] })], now)).toBe(true);
  });
});
