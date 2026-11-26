import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

vi.mock("@/lib/prisma", () => ({ default: {} }));
import { DEFAULT_ADJUST, ffmpegVideoFilter } from "@/lib/backgrounds/adjust";
import { applyBackgroundVideoAdjust } from "@/lib/backgrounds/renditions";

// Real ffmpeg, real pixels: a short solid-colour clip goes through the same
// adjustment the server makes, then one frame is read back.
const ff = ffmpegPath as unknown as string;

function makeClip(colour: string, size = "320x180", extra: string[] = []): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "bgtest-"));
  const out = path.join(dir, "c.mp4");
  const r = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${colour}:s=${size}:d=1:r=10`, ...extra, "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv444p", out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const buf = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return buf;
}

async function frameInfo(video: Buffer) {
  const dir = mkdtempSync(path.join(tmpdir(), "bgframe-"));
  const vin = path.join(dir, "v.mp4");
  const png = path.join(dir, "f.png");
  writeFileSync(vin, video);
  const probe = spawnSync(ff, ["-hide_banner", "-i", vin]).stderr.toString();
  spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", vin, "-frames:v", "1", png]);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  rmSync(dir, { recursive: true, force: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return { rgb: [data[i], data[i + 1], data[i + 2]], width: info.width, height: info.height, hasAudio: /Audio:/.test(probe) };
}

describe("ffmpegVideoFilter", () => {
  it("bounds the long edge to 1920 with even sizes, then blur and the colour matrix", () => {
    const f = ffmpegVideoFilter({ darken: 50, warmth: 0, saturation: 100, blur: 2 }, 3840, 2160);
    expect(f).toMatch(/^scale=1920:1080:flags=bicubic,gblur=sigma=3\.84,format=gbrp,colorchannelmixer=rr=0\.50000:.*bb=0\.50000,format=yuv420p$/);
    expect(ffmpegVideoFilter(DEFAULT_ADJUST, 1081, 1921)).toMatch(/^scale=1080:1920:/);
    expect(ffmpegVideoFilter(DEFAULT_ADJUST, 640, 360)).not.toContain("gblur");
  });
});

describe("applyBackgroundVideoAdjust (real ffmpeg)", () => {
  it("darken 50% halves the colours", async () => {
    const out = await frameInfo(await applyBackgroundVideoAdjust(makeClip("0xC8A078"), { ...DEFAULT_ADJUST, darken: 50 }));
    out.rgb.forEach((v, i) => expect(Math.abs(v - [100, 80, 60][i])).toBeLessThanOrEqual(8));
  }, 60_000);

  it("warmth raises red and lowers blue", async () => {
    const { rgb } = await frameInfo(await applyBackgroundVideoAdjust(makeClip("0x808080"), { ...DEFAULT_ADJUST, warmth: 100 }));
    expect(rgb[0]).toBeGreaterThan(rgb[2] + 30);
  }, 60_000);

  it("caps a large clip at 1920 wide and drops the sound", async () => {
    const clip = makeClip("0x336699", "2400x1350", ["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", "-shortest"]);
    const out = await frameInfo(await applyBackgroundVideoAdjust(clip, { ...DEFAULT_ADJUST, darken: 10 }));
    expect([out.width, out.height]).toEqual([1920, 1080]);
    expect(out.hasAudio).toBe(false);
  }, 120_000);

  it("refuses something that isn't a video", async () => {
    await expect(applyBackgroundVideoAdjust(Buffer.from("not a video"), { ...DEFAULT_ADJUST, darken: 10 })).rejects.toThrow(/couldn't be read/);
  }, 30_000);
});
