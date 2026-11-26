import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { adjustKey, blurSigma, colourMatrix, isDefaultAdjust, type BackgroundAdjust } from "@/lib/backgrounds/adjust";
import { BackgroundMediaError } from "@/lib/backgrounds/media";

// Server half of the photo adjustments (see lib/backgrounds/adjust.ts for the
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

function readRenditions(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export function backgroundRenditionUrls(value: Prisma.JsonValue | null): string[] {
  return Object.values(readRenditions(value));
}

// The URL to send to the provider for this background with these
// adjustments: the original for videos or no adjustment, otherwise an
// adjusted photo copy (made and cached on first use).
export async function adjustedBackgroundUrl(userId: string, backgroundMediaId: string, adjust: BackgroundAdjust | null): Promise<string> {
  const media = await prisma.backgroundMedia.findFirst({
    where: { id: backgroundMediaId, userId },
    select: { id: true, kind: true, url: true, renditions: true },
  });
  if (!media) throw new BackgroundMediaError("A background isn't available on your account any more. Choose it again.");
  if (media.kind !== "IMAGE" || !adjust || isDefaultAdjust(adjust)) return media.url;

  const key = adjustKey(adjust);
  const renditions = readRenditions(media.renditions);
  const cached = renditions[key];
  if (cached) {
    const head = await fetch(cached, { method: "HEAD", signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (head?.ok) return cached;
  }

  const res = await fetch(media.url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) throw new BackgroundMediaError("A background photo couldn't be loaded. Upload it again and try once more.");
  let adjusted: Buffer;
  try {
    adjusted = await applyBackgroundAdjust(Buffer.from(await res.arrayBuffer()), adjust);
  } catch {
    throw new BackgroundMediaError("A background photo couldn't be adjusted. Upload it again and try once more.");
  }
  const blob = await put(`backgrounds/${userId}/adjusted-${randomUUID()}.jpg`, adjusted, { access: "public", contentType: "image/jpeg" });
  await prisma.backgroundMedia.update({ where: { id: media.id }, data: { renditions: { ...renditions, [key]: blob.url } } });
  return blob.url;
}
