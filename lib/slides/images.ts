import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { del, put } from "@vercel/blob";
import { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import type { SlideImageData } from "@/lib/projects/rules";

// Slide images: rendered document pages and hand-uploaded slides, stored on
// Vercel Blob (the app's existing media store) and tracked as SlideImage rows
// so ownership can be checked.
//
// Storage keys are slides/<userId>/<random uuid>.jpg: no file name, title or
// document text ever goes into a URL. Blob URLs are public but unguessable,
// the same as watermarks and scene crops, because the video provider must
// download them without signing in (its docs: "Public http(s) URL HeyGen can
// download without auth or redirects"). The docs don't say how long the URL
// must stay reachable, so nothing is removed while a render may still need
// it; a day after the last render finishes they're deleted (see
// removeSlideImagesAfterRender).

// Longest edge of a stored slide. 1080p output is at most 1920 wide, and
// this also bounds memory for every later step.
export const SLIDE_MAX_EDGE = 1920;
// Refuse decompression bombs before sharp allocates the full bitmap.
const MAX_INPUT_PIXELS = 40_000_000;
// Letterbox colour for slides whose shape differs from the video's. Black
// is the usual video convention and matches the editor preview.
export const LETTERBOX_BACKGROUND = "#000000";

// Output canvas per project aspect ratio (lib/validations/video.ts), at the
// 1080p size the provider renders by default.
const CANVAS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export class SlideImageError extends Error {}

// Decodes, auto-rotates, flattens transparency onto white, bounds the size
// and re-encodes as high-quality JPEG (4:4:4 chroma keeps small text crisp).
// Anything sharp can't decode is rejected here, which is also the content
// check for uploads: the browser-reported type isn't trusted on its own.
export async function normaliseSlideImage(input: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: SLIDE_MAX_EDGE, height: SLIDE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new SlideImageError("Couldn't read that image. It may be damaged or in an unsupported format.");
  }
}

async function uploadJpeg(userId: string, buffer: Buffer): Promise<string> {
  const blob = await put(`slides/${userId}/${randomUUID()}.jpg`, buffer, {
    access: "public",
    contentType: "image/jpeg",
  });
  return blob.url;
}

export async function storeSlideImage(
  userId: string,
  image: { buffer: Buffer; width: number; height: number },
): Promise<SlideImageData> {
  const url = await uploadJpeg(userId, image.buffer);
  try {
    return await prisma.slideImage.create({
      data: { userId, url, width: image.width, height: image.height },
      select: { id: true, url: true, width: true, height: true },
    });
  } catch (err) {
    await del(url).catch(() => {});
    throw err;
  }
}

// Removes slide images created by a step that then failed (for example an
// import that hit a version conflict). Only rows no scene points at are
// touched, so an image already shown somewhere is never deleted.
export async function discardUnusedSlideImages(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unused = await prisma.slideImage.findMany({
    where: { id: { in: ids }, userId, scenes: { none: {} } },
    select: { id: true, url: true, renditions: true },
  });
  if (unused.length === 0) return;
  const urls = unused.flatMap((img) => [img.url, ...Object.values(readRenditions(img.renditions))]);
  await del(urls).catch((err) => console.error("Slide image clean-up (Blob) failed:", err));
  await prisma.slideImage.deleteMany({ where: { id: { in: unused.map((img) => img.id) }, userId, scenes: { none: {} } } });
}

// Retention rule for slide images, applied after deletes and replacements
// (scene, scenes, project, slide replacement, import replace):
//  - an image is kept while any scene of the user points at it;
//  - it's kept while a render of an existing project still shows it. That
//    covers a generation in flight (the provider must still be able to
//    download the URL, its docs: "stay valid until HeyGen fetches it") and
//    a finished video's scene list, which displays the slide;
//  - otherwise, once it's older than a grace period (so a just-uploaded
//    image isn't lost before its scene is saved), the row and every file
//    (original and letterboxed copies) are deleted;
//  - for images still in use, letterboxed copies for aspect ratios that no
//    project using them is set to are dropped (they're cheap to remake).
// So after a project is deleted, its slides are removed on the next prune
// unless another project still uses them.
export const SLIDE_IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

async function urlsShownByRenders(userId: string): Promise<Set<string>> {
  const videos = await prisma.generatedVideo.findMany({
    where: { userId, projectId: { not: null } },
    select: { sceneSnapshot: true },
  });
  const urls = new Set<string>();
  for (const v of videos) {
    if (!Array.isArray(v.sceneSnapshot)) continue;
    for (const scene of v.sceneSnapshot) {
      const url = scene && typeof scene === "object" && !Array.isArray(scene) ? scene.mediaUrl : null;
      if (typeof url === "string") urls.add(url);
    }
  }
  return urls;
}

export async function pruneUnusedSlideImages(userId: string, now: Date = new Date()): Promise<{ imagesDeleted: number; copiesDeleted: number }> {
  const shown = await urlsShownByRenders(userId);
  let imagesDeleted = 0;
  let copiesDeleted = 0;

  const unused = await prisma.slideImage.findMany({
    where: { userId, scenes: { none: {} }, createdAt: { lt: new Date(now.getTime() - SLIDE_IMAGE_GRACE_MS) } },
    select: { id: true, url: true, renditions: true },
  });
  for (const img of unused) {
    const urls = [img.url, ...Object.values(readRenditions(img.renditions))];
    if (urls.some((u) => shown.has(u))) continue;
    // Row first, re-checking "unused" in the same statement, so a scene that
    // picked the image up in the meantime keeps it. Files only after that.
    const { count } = await prisma.slideImage.deleteMany({ where: { id: img.id, userId, scenes: { none: {} } } });
    if (count !== 1) continue;
    await del(urls).catch((err) => console.error("Slide image clean-up (Blob) failed:", err));
    imagesDeleted += 1;
  }

  const inUse = await prisma.slideImage.findMany({
    where: { userId, scenes: { some: {} }, NOT: { renditions: { equals: Prisma.DbNull } } },
    select: { id: true, renditions: true, scenes: { select: { project: { select: { aspectRatio: true } } } } },
  });
  for (const img of inUse) {
    const renditions = readRenditions(img.renditions);
    const wanted = new Set(img.scenes.map((s) => s.project.aspectRatio));
    const stale = Object.entries(renditions).filter(([ratio, url]) => !wanted.has(ratio) && !shown.has(url));
    if (stale.length === 0) continue;
    const kept = Object.fromEntries(Object.entries(renditions).filter(([ratio]) => !stale.some(([r]) => r === ratio)));
    await prisma.slideImage.update({ where: { id: img.id }, data: { renditions: kept } });
    await del(stale.map(([, url]) => url)).catch((err) => console.error("Slide copy clean-up (Blob) failed:", err));
    copiesDeleted += stale.length;
  }

  return { imagesDeleted, copiesDeleted };
}

// Privacy rule, run daily by the video-maintenance cron: a finished video
// already contains its slides, so once the most recent render that used a
// slide image finished more than this long ago, the image (original and every
// letterboxed copy) is deleted even though scenes still point at it. Those
// scenes lose their slide (onDelete SetNull) and need it added again before
// the project can be generated again; the editor says so.
//
// An image is left alone while any render that shows it is still running, or
// was started within the window (a retry after a failure, or a fresh
// re-generation, restarts the clock). Images never rendered are untouched.
//
// Known gap: a generation started in the same moment the sweep runs could
// fetch the image just before it's deleted; the provider then fails that
// render and its reserved credits are released as for any failed render.
export const SLIDE_RETENTION_AFTER_RENDER_MS = 24 * 60 * 60 * 1000;
// Bounds one run's work (each deletion is a DB row plus a Blob call batch).
const MAX_SLIDE_IMAGES_REMOVED_PER_RUN = 1000;

type RenderForRetention = {
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  sceneSnapshot: Prisma.JsonValue | null;
};

function snapshotUrls(snapshot: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((scene) =>
    scene && typeof scene === "object" && !Array.isArray(scene) && typeof scene.mediaUrl === "string" ? [scene.mediaUrl] : [],
  );
}

// Pure: decides whether one image's renders allow removing it. Exported for tests.
export function slideImageExpiredByRenders(imageUrls: string[], renders: RenderForRetention[], now: Date): boolean {
  const cutoff = now.getTime() - SLIDE_RETENTION_AFTER_RENDER_MS;
  const mine = new Set(imageUrls);
  const showing = renders.filter((r) => snapshotUrls(r.sceneSnapshot).some((u) => mine.has(u)));
  if (showing.length === 0) return false;
  const finishedBeforeCutoff = showing.some(
    (r) => r.status === "COMPLETED" && r.completedAt !== null && r.completedAt.getTime() < cutoff,
  );
  const stillActive = showing.some(
    (r) => r.status === "PENDING" || r.status === "PROCESSING" || r.createdAt.getTime() >= cutoff || (r.completedAt?.getTime() ?? 0) >= cutoff,
  );
  return finishedBeforeCutoff && !stillActive;
}

export async function removeSlideImagesAfterRender(now: Date = new Date()): Promise<{ usersChecked: number; imagesDeleted: number }> {
  const cutoff = new Date(now.getTime() - SLIDE_RETENTION_AFTER_RENDER_MS);
  // Only users who have both an image old enough and a project render that
  // finished before the cutoff can have anything to remove.
  const users = await prisma.user.findMany({
    where: {
      slideImages: { some: { createdAt: { lt: cutoff } } },
      generatedVideos: { some: { status: "COMPLETED", completedAt: { lt: cutoff }, NOT: { sceneSnapshot: { equals: Prisma.DbNull } } } },
    },
    select: { id: true },
  });

  let imagesDeleted = 0;
  for (const { id: userId } of users) {
    if (imagesDeleted >= MAX_SLIDE_IMAGES_REMOVED_PER_RUN) break;
    const renders = await prisma.generatedVideo.findMany({
      where: { userId, NOT: { sceneSnapshot: { equals: Prisma.DbNull } } },
      select: { status: true, createdAt: true, completedAt: true, sceneSnapshot: true },
    });
    const images = await prisma.slideImage.findMany({
      where: { userId, createdAt: { lt: cutoff } },
      select: { id: true, url: true, renditions: true },
    });
    for (const img of images) {
      if (imagesDeleted >= MAX_SLIDE_IMAGES_REMOVED_PER_RUN) break;
      const urls = [img.url, ...Object.values(readRenditions(img.renditions))];
      if (!slideImageExpiredByRenders(urls, renders, now)) continue;
      // Row first (scenes are detached by SetNull), files after, so a file is
      // never gone while the database still offers it.
      const { count } = await prisma.slideImage.deleteMany({ where: { id: img.id, userId } });
      if (count !== 1) continue;
      await del(urls).catch((err) => console.error("Slide image removal after render (Blob) failed:", err));
      imagesDeleted += 1;
    }
  }
  return { usersChecked: users.length, imagesDeleted };
}

// For routes: run the prune after a successful change, but never let a
// clean-up problem turn that success into an error (it only means an unused
// image lingers until the next prune).
export async function pruneUnusedSlideImagesQuietly(userId: string): Promise<void> {
  await pruneUnusedSlideImages(userId).catch((err) => console.error("Slide image pruning failed:", err));
}

function readRenditions(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

// Pads a slide to the exact output canvas (never crops), so the whole slide
// is visible however the provider fits off-ratio images. Pure: no I/O.
export async function letterboxSlide(input: Buffer, aspectRatio: string): Promise<Buffer> {
  const canvas = CANVAS[aspectRatio] ?? CANVAS["16:9"];
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: canvas.width, height: canvas.height, fit: "contain", background: LETTERBOX_BACKGROUND })
    .flatten({ background: LETTERBOX_BACKGROUND })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

// Returns the letterboxed copy of a slide for this aspect ratio, making and
// caching it on first use. Fetching the original doubles as the "is the
// image still reachable" check before a provider job is submitted.
export async function slideRenditionUrl(userId: string, slideImageId: string, aspectRatio: string): Promise<string> {
  const image = await prisma.slideImage.findFirst({
    where: { id: slideImageId, userId },
    select: { id: true, url: true, renditions: true },
  });
  if (!image) throw new SlideImageError("That slide image isn't available on your account.");

  const renditions = readRenditions(image.renditions);
  const cached = renditions[aspectRatio];
  if (cached) {
    const head = await fetch(cached, { method: "HEAD", signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (head?.ok) return cached;
  }

  const res = await fetch(image.url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) throw new SlideImageError("A slide image couldn't be loaded. Replace it and try again.");
  const padded = await letterboxSlide(Buffer.from(await res.arrayBuffer()), aspectRatio);
  const url = await uploadJpeg(userId, padded);
  await prisma.slideImage.update({
    where: { id: image.id },
    data: { renditions: { ...renditions, [aspectRatio]: url } },
  });
  return url;
}
