import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { adjustKey, blurSigma, colourMatrix, ffmpegVideoFilter, isDefaultAdjust, type BackgroundAdjust } from "@/lib/backgrounds/adjust";
import { BackgroundMediaError } from "@/lib/backgrounds/media";

// Server half of the photo and video adjustments (see lib/backgrounds/adjust.ts for the
// shared maths). The uploaded original is never changed: an adjusted copy is
// made once per setting and cached on BackgroundMedia.renditions, keyed by
// adjustKey, like slide images cache their letterboxed copies.

const MAX_EDGE = 1920;
const MAX_INPUT_PIXELS = 40_000_000;

// Pure: no I/O. Bounds the size, blurs, then applies the one colour matrix.
export async function applyBackgroundAdjust(input: Buffer, adjust: BackgroundAdjust): Promise<Buffer> {
  const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: "#000000" })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });

  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  const sigma = blurSigma(adjust, info.width);
  // sharp's minimum sigma is 0.3; anything smaller is invisible anyway.
  if (sigma >= 0.3) img = img.blur(sigma);
  img = img.recomb(colourMatrix(adjust));
  return img.jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
}

// ---- Video backgrounds (ffmpeg) -------------------------------------------
// ffmpeg-static ships the ffmpeg program; it runs as a separate process.
// Bounded so one request can't run away: the first 2 minutes of the clip
// (the provider loops a background for the whole scene anyway), sound
// dropped (backgrounds are muted), and a hard time limit.
const MAX_VIDEO_SECONDS = 120;
const FFMPEG_TIMEOUT_MS = 240_000;

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- resolved at runtime from node_modules (serverExternalPackages)
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new BackgroundMediaError("Video adjustments aren't available right now. Reset them, or try again later.");
  return p;
}

export function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-20_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

// ffmpeg prints the input's size when given no output ("Stream #0:0 ... Video: h264 ..., 1920x1080").
async function probeVideoSize(inputPath: string): Promise<{ width: number; height: number }> {
  const { stderr } = await runFfmpeg(["-hide_banner", "-i", inputPath]);
  const match = stderr.match(/Stream #\S+.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!match) throw new BackgroundMediaError("That video couldn't be read. Try a different MP4 file.");
  return { width: Number(match[1]), height: Number(match[2]) };
}

// Writes an adjusted MP4 (H.264, no sound, long edge at most 1920) and returns it.
export async function applyBackgroundVideoAdjust(input: Buffer, adjust: BackgroundAdjust): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "bg-video-"));
  try {
    const inPath = path.join(dir, "in.mp4");
    const outPath = path.join(dir, "out.mp4");
    await writeFile(inPath, input);
    const { width, height } = await probeVideoSize(inPath);
    const { code, stderr } = await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inPath,
      "-t", String(MAX_VIDEO_SECONDS),
      "-an",
      "-vf", ffmpegVideoFilter(adjust, width, height),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);
    if (code !== 0) {
      console.error("ffmpeg background adjust failed:", stderr.slice(-2000));
      throw new BackgroundMediaError("A background video couldn't be adjusted. Try a different MP4 file, or reset the adjustments.");
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function readRenditions(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export function backgroundRenditionUrls(value: Prisma.JsonValue | null): string[] {
  return Object.values(readRenditions(value));
}

// The URL to send to the provider for this background with these
// adjustments: the original when unadjusted, otherwise an adjusted photo or
// video copy (made with sharp or ffmpeg on first use, then cached).
export async function adjustedBackgroundUrl(userId: string, backgroundMediaId: string, adjust: BackgroundAdjust | null): Promise<string> {
  const media = await prisma.backgroundMedia.findFirst({
    where: { id: backgroundMediaId, userId },
    select: { id: true, kind: true, url: true, renditions: true },
  });
  if (!media) throw new BackgroundMediaError("A background isn't available on your account any more. Choose it again.");
  if (!adjust || isDefaultAdjust(adjust)) return media.url;
  const isVideo = media.kind === "VIDEO";

  const key = adjustKey(adjust);
  const renditions = readRenditions(media.renditions);
  const cached = renditions[key];
  if (cached) {
    const head = await fetch(cached, { method: "HEAD", signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (head?.ok) return cached;
  }

  const res = await fetch(media.url, { signal: AbortSignal.timeout(isVideo ? 60000 : 20000) }).catch(() => null);
  if (!res?.ok) throw new BackgroundMediaError(`A background ${isVideo ? "video" : "photo"} couldn't be loaded. Upload it again and try once more.`);
  const original = Buffer.from(await res.arrayBuffer());
  let adjusted: Buffer;
  try {
    adjusted = isVideo ? await applyBackgroundVideoAdjust(original, adjust) : await applyBackgroundAdjust(original, adjust);
  } catch (err) {
    if (err instanceof BackgroundMediaError) throw err;
    console.error("Background adjust failed:", err);
    throw new BackgroundMediaError(`A background ${isVideo ? "video" : "photo"} couldn't be adjusted. Upload it again and try once more.`);
  }
  const blob = await put(`backgrounds/${userId}/adjusted-${randomUUID()}.${isVideo ? "mp4" : "jpg"}`, adjusted, {
    access: "public",
    contentType: isVideo ? "video/mp4" : "image/jpeg",
  });
  await prisma.backgroundMedia.update({ where: { id: media.id }, data: { renditions: { ...renditions, [key]: blob.url } } });
  return blob.url;
}
