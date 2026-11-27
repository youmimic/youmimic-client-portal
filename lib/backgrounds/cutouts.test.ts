import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const db = vi.hoisted(() => ({
  avatarLook: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  appSetting: { findUnique: vi.fn() },
}));
const heygen = vi.hoisted(() => ({
  createHeyGenTransparentClip: vi.fn(),
  deleteHeyGenVideo: vi.fn(async () => {}),
  getHeyGenAvatarLook: vi.fn(async () => ({ default_voice_id: "voice-x" })),
  getHeyGenVideoStatus: vi.fn(),
}));
const blob = vi.hoisted(() => ({ put: vi.fn(async (p: string) => ({ url: `https://x.public.blob.vercel-storage.com/${p}` })), del: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/heygen", async (orig) => ({ ...(await orig<typeof import("@/lib/heygen")>()), ...heygen }));

import { HeyGenApiError } from "@/lib/heygen";
import { extractCutoutFrame, isCutoutRefusal, processCutoutQueue } from "@/lib/backgrounds/cutouts";

const ff = ffmpegPath as unknown as string;

// A real transparent VP9 WebM: left half opaque red, right half fully clear.
async function transparentWebm(): Promise<Buffer> {
  const dir = mkdtempSync(path.join(tmpdir(), "cutout-src-"));
  const png = path.join(dir, "f.png");
  const out = path.join(dir, "c.webm");
  const half = await sharp({ create: { width: 64, height: 36, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 32, height: 36, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }])
    .png()
    .toBuffer();
  writeFileSync(png, half);
  const r = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", png, "-t", "0.5", "-r", "10", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const buf = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return buf;
}

describe("extractCutoutFrame (real ffmpeg)", () => {
  it("keeps the transparency of the clip's first frame", async () => {
    const png = await extractCutoutFrame(await transparentWebm());
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(8, 18)).toBeGreaterThan(240); // the opaque half
    expect(alphaAt(56, 18)).toBeLessThan(15); // the clear half
  }, 60_000);

  it("refuses a file that isn't a video", async () => {
    await expect(extractCutoutFrame(Buffer.from("nope"))).rejects.toThrow();
  }, 30_000);
});

const now = new Date("2026-11-27T05:00:00Z");
const look = (over: Record<string, unknown> = {}) => ({
  id: "lk1",
  name: "L03",
  heygenLookId: "hg-l03",
  defaultVoiceId: "v1",
  backgroundRemoval: "UNKNOWN",
  cutoutUrl: null,
  cutoutHeygenVideoId: null,
  cutoutAttempts: 0,
  cutoutUpdatedAt: new Date(now.getTime() - 60_000),
  ...over,
});
const updates = () => db.avatarLook.update.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
  db.appSetting.findUnique.mockResolvedValue(null); // autoCutouts off
  db.avatarLook.update.mockResolvedValue({});
  db.avatarLook.updateMany.mockResolvedValue({ count: 0 });
  db.avatarLook.findMany.mockResolvedValue([]);
});

describe("processCutoutQueue", () => {
  it("starts queued looks as transparent clips", async () => {
    db.avatarLook.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([look()]);
    heygen.createHeyGenTransparentClip.mockResolvedValue({ video_id: "clip1" });

    expect(await processCutoutQueue(now)).toMatchObject({ started: 1 });
    expect(heygen.createHeyGenTransparentClip).toHaveBeenCalledWith(expect.objectContaining({ avatarId: "hg-l03", voiceId: "v1" }));
    expect(updates()[0]).toMatchObject({ cutoutStatus: "RENDERING", cutoutHeygenVideoId: "clip1" });
  });

  it("a refusal marks the look as impossible to cut out, and unsupported only if not yet checked", async () => {
    heygen.createHeyGenTransparentClip.mockRejectedValue(new HeyGenApiError("This video avatar does not support webm output. The avatar must be trained with matting enabled.", "invalid_parameter", 400));
    db.avatarLook.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([look(), look({ id: "lk2", backgroundRemoval: "SUPPORTED" })]);

    expect(await processCutoutQueue(now)).toMatchObject({ notPossible: 2 });
    expect(updates()[0]).toMatchObject({ cutoutStatus: "NOT_POSSIBLE", backgroundRemoval: "UNSUPPORTED" });
    // An admin's own choice is left alone.
    expect(updates()[1]).toMatchObject({ cutoutStatus: "NOT_POSSIBLE" });
    expect("backgroundRemoval" in updates()[1]).toBe(false);
  });

  it("collects a finished clip: stores the PNG, turns backgrounds on if unchecked, deletes the clip", async () => {
    const webm = await transparentWebm();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(webm))));
    heygen.getHeyGenVideoStatus.mockResolvedValue({ status: "completed", video_url: "https://heygen/clip.webm", thumbnail_url: null });
    db.avatarLook.findMany.mockResolvedValueOnce([look({ cutoutHeygenVideoId: "clip1", cutoutUrl: "https://x/old.png" })]).mockResolvedValueOnce([]);

    expect(await processCutoutQueue(now)).toMatchObject({ collected: 1 });
    expect(blob.put).toHaveBeenCalledWith(expect.stringMatching(/^cutouts\/lk1-.*\.png$/), expect.any(Buffer), expect.objectContaining({ contentType: "image/png" }));
    expect(updates()[0]).toMatchObject({ cutoutStatus: "READY", backgroundRemoval: "SUPPORTED", cutoutHeygenVideoId: null });
    expect(blob.del).toHaveBeenCalledWith("https://x/old.png");
    expect(heygen.deleteHeyGenVideo).toHaveBeenCalledWith("clip1");
    vi.unstubAllGlobals();
  }, 60_000);

  it("keeps waiting while rendering, gives up after 30 minutes, and fails after 3 attempts", async () => {
    heygen.getHeyGenVideoStatus.mockResolvedValue({ status: "processing", video_url: null, thumbnail_url: null });
    db.avatarLook.findMany.mockResolvedValueOnce([look({ cutoutHeygenVideoId: "c1" })]).mockResolvedValueOnce([]);
    expect(await processCutoutQueue(now)).toMatchObject({ waiting: 1 });

    db.avatarLook.findMany
      .mockResolvedValueOnce([look({ cutoutHeygenVideoId: "c1", cutoutUpdatedAt: new Date(now.getTime() - 31 * 60_000) })])
      .mockResolvedValueOnce([]);
    expect(await processCutoutQueue(now)).toMatchObject({ retrying: 1 });
    expect(updates().at(-1)).toMatchObject({ cutoutStatus: "QUEUED", cutoutAttempts: 1 });

    heygen.getHeyGenVideoStatus.mockResolvedValue({ status: "failed", video_url: null, thumbnail_url: null });
    db.avatarLook.findMany.mockResolvedValueOnce([look({ cutoutHeygenVideoId: "c1", cutoutAttempts: 2 })]).mockResolvedValueOnce([]);
    expect(await processCutoutQueue(now)).toMatchObject({ failed: 1 });
    expect(updates().at(-1)).toMatchObject({ cutoutStatus: "FAILED", cutoutAttempts: 3 });
  });

  it("queues new ready looks only when automatic cut-outs are switched on", async () => {
    await processCutoutQueue(now);
    expect(db.avatarLook.updateMany).not.toHaveBeenCalled();

    db.appSetting.findUnique.mockResolvedValue({ value: true });
    db.avatarLook.updateMany.mockResolvedValue({ count: 4 });
    expect(await processCutoutQueue(now)).toMatchObject({ autoQueued: 4 });
    expect(db.avatarLook.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "ready", cutoutStatus: "NONE" } }));
  });

  it("recognises the provider's refusal text and nothing else", () => {
    expect(isCutoutRefusal("This video avatar does not support webm output.")).toBe(true);
    expect(isCutoutRefusal("The avatar must be trained with matting enabled.")).toBe(true);
    expect(isCutoutRefusal("Rate limit exceeded")).toBe(false);
  });
});
