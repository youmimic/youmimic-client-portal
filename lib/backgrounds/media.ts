import { del, head } from "@vercel/blob";
import prisma from "@/lib/prisma";

// Photos and videos shown behind a cut-out avatar (provider: remove_background
// + background image/video, verified with real renders on 2026-11-26).
//
// Files go straight from the browser to Vercel Blob (a Vercel Function only
// accepts 4.5 MB request bodies, too small for video); our server only issues
// a short-lived upload token (see the upload route) and then registers the
// finished file here, after checking it is in this user's folder of our own
// store and is the right type and size. Like slide images, URLs are public
// but unguessable because the provider must download them without signing in.

export type BackgroundKind = "IMAGE" | "VIDEO";

export const BACKGROUND_LIMITS: Record<BackgroundKind, { types: string[]; maxBytes: number; label: string }> = {
  // The provider's asset limits are 32 MB for images and 50 MB for other
  // files; images stay well under, videos at the same cap.
  IMAGE: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 20 * 1024 * 1024, label: "JPG, PNG or WebP up to 20 MB" },
  VIDEO: { types: ["video/mp4"], maxBytes: 50 * 1024 * 1024, label: "MP4 up to 50 MB" },
};

export function backgroundKindForType(contentType: string): BackgroundKind | null {
  if (BACKGROUND_LIMITS.IMAGE.types.includes(contentType)) return "IMAGE";
  if (BACKGROUND_LIMITS.VIDEO.types.includes(contentType)) return "VIDEO";
  return null;
}

export const backgroundFolder = (userId: string) => `backgrounds/${userId}/`;

export class BackgroundMediaError extends Error {}

// Token rules for one browser upload: only into this user's folder, only the
// allowed types, at most the larger limit (the exact per-kind size is checked
// again at registration, once the real type is known).
export function backgroundUploadTokenOptions(userId: string, pathname: string) {
  if (!pathname.startsWith(backgroundFolder(userId)) || pathname.includes("..")) {
    throw new BackgroundMediaError("That upload path isn't allowed.");
  }
  return {
    allowedContentTypes: [...BACKGROUND_LIMITS.IMAGE.types, ...BACKGROUND_LIMITS.VIDEO.types],
    maximumSizeInBytes: BACKGROUND_LIMITS.VIDEO.maxBytes,
    addRandomSuffix: true,
    validUntil: Date.now() + 10 * 60 * 1000,
  };
}

export type BackgroundMediaData = { id: string; kind: BackgroundKind; url: string; contentType: string; sizeBytes: number };

// Records an uploaded file for this user after checking it really is theirs
// and acceptable. Anything that fails a check is deleted, so a rejected
// upload never lingers in storage.
export async function registerBackgroundMedia(userId: string, url: string): Promise<BackgroundMediaData> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BackgroundMediaError("That upload couldn't be found.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
    throw new BackgroundMediaError("That upload couldn't be found.");
  }
  if (!decodeURIComponent(parsed.pathname).startsWith(`/${backgroundFolder(userId)}`)) {
    throw new BackgroundMediaError("That upload couldn't be found.");
  }

  const meta = await head(url).catch(() => null);
  if (!meta) throw new BackgroundMediaError("That upload couldn't be found. Please try again.");

  const kind = backgroundKindForType(meta.contentType);
  const problem = !kind
    ? "Use a JPG, PNG or WebP photo, or an MP4 video."
    : meta.size > BACKGROUND_LIMITS[kind].maxBytes
      ? `That file is too large (${BACKGROUND_LIMITS[kind].label}).`
      : null;
  if (problem || !kind) {
    await del(url).catch(() => {});
    throw new BackgroundMediaError(problem ?? "That file type isn't supported.");
  }

  const existing = await prisma.backgroundMedia.findFirst({
    where: { userId, url },
    select: { id: true, kind: true, url: true, contentType: true, sizeBytes: true },
  });
  if (existing) return existing;
  return prisma.backgroundMedia.create({
    data: { userId, kind, url, contentType: meta.contentType, sizeBytes: meta.size },
    select: { id: true, kind: true, url: true, contentType: true, sizeBytes: true },
  });
}

// The provider's 400 for a look that wasn't trained for background removal
// ("This video avatar does not support background removal. ...", per its
// docs, 2026-11-26).
export function isBackgroundRemovalRejection(message: string): boolean {
  return /does not support background removal|trained with matting/i.test(message);
}

export async function markLookBackgroundUnsupported(avatarLookId: string): Promise<void> {
  await prisma.avatarLook
    .update({ where: { id: avatarLookId }, data: { backgroundRemoval: "UNSUPPORTED" } })
    .catch((err) => console.error("Couldn't record a look's background support:", err));
}

export const BACKGROUND_REJECTED_MESSAGE =
  "This avatar look can't be shown on a custom background. Set the background back to Original, or choose another look.";

// Backgrounds are reusable (a company's office photo, say), so unlike slide
// images they are NOT deleted after a render. A background is removed once no
// scene uses it, it is older than a day (so a just-uploaded file isn't lost
// before its scene saves), and no render that still needs it is in flight or
// was started within the day. Run by the daily video-maintenance cron.
export const UNUSED_BACKGROUND_GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_REMOVED_PER_RUN = 1000;

function snapshotBackgroundUrls(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((s) =>
    s && typeof s === "object" && typeof (s as { backgroundUrl?: unknown }).backgroundUrl === "string"
      ? [(s as { backgroundUrl: string }).backgroundUrl]
      : [],
  );
}

export async function removeUnusedBackgroundMedia(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - UNUSED_BACKGROUND_GRACE_MS);
  const candidates = await prisma.backgroundMedia.findMany({
    where: { scenes: { none: {} }, createdAt: { lt: cutoff } },
    select: { id: true, userId: true, url: true },
    take: MAX_REMOVED_PER_RUN,
  });
  if (candidates.length === 0) return { deleted: 0 };

  // Renders that may still need their background: in progress, or started
  // within the grace window (a retry restarts the clock).
  const recent = await prisma.generatedVideo.findMany({
    where: {
      userId: { in: [...new Set(candidates.map((c) => c.userId))] },
      OR: [{ status: { in: ["PENDING", "PROCESSING"] } }, { createdAt: { gte: cutoff } }],
    },
    select: { backgroundUrl: true, sceneSnapshot: true },
  });
  const stillNeeded = new Set<string>();
  for (const v of recent) {
    if (v.backgroundUrl) stillNeeded.add(v.backgroundUrl);
    for (const u of snapshotBackgroundUrls(v.sceneSnapshot)) stillNeeded.add(u);
  }

  let deleted = 0;
  for (const media of candidates) {
    if (stillNeeded.has(media.url)) continue;
    // Row first, re-checking "unused" in the same statement, files after.
    const { count } = await prisma.backgroundMedia.deleteMany({ where: { id: media.id, scenes: { none: {} } } });
    if (count !== 1) continue;
    await del(media.url).catch((err) => console.error("Background clean-up (Blob) failed:", err));
    deleted += 1;
  }
  return { deleted };
}
