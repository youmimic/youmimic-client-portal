import prisma from "@/lib/prisma";
import {
  getHeyGenAvatarLook,
  getHeyGenVideoStatus,
  createHeyGenVideo,
  HeyGenApiError,
  type HeyGenEngine,
} from "@/lib/heygen";
import type { VideoEngine, VideoGenerationStatus } from "@/app/generated/prisma/enums";
import { estimatedCostCents } from "@/lib/heygen/pricing";
import { reserveCreditsForGeneration, releaseReservation, reconcileCredits, releaseReservationForVideo } from "@/lib/usage/ledger";

// Maps the lowercase HeyGen API value (also what lib/validations/video.ts's
// generateVideoSchema accepts from the client) to the Prisma enum value
// stored on GeneratedVideo.engine.
const ENGINE_TO_PRISMA: Record<HeyGenEngine, VideoEngine> = {
  avatar_iii: "AVATAR_III" as VideoEngine,
  avatar_iv: "AVATAR_IV" as VideoEngine,
  avatar_v: "AVATAR_V" as VideoEngine,
};

// Optional workspace settings. Every field is optional so callers that only
// have a script keep the original behaviour (provider defaults, and the
// chosen look's own default voice).
export type GenerateVideoOptions = {
  title?: string;
  aspectRatio?: string;
  resolution?: string;
  voiceId?: string;
  voiceName?: string;
};

export type GenerateVideoResult =
  | { ok: true; generatedVideoId: string }
  | {
      ok: false;
      code: "AVATAR_NOT_READY" | "NO_VOICE" | "HEYGEN_ERROR";
      error: string;
    }
  | {
      ok: false;
      code: "OVER_LIMIT";
      error: string;
      // Millicredits and an ISO date, so the UI can show a usable
      // credit-limit state instead of only the message text.
      creditsUsedMilli: number;
      creditsLimitMilli: number;
      periodEnd: string;
    };

function callbackUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.includes("localhost")) return undefined; // HeyGen can't reach a local URL
  return `${appUrl}/api/webhooks/heygen`;
}

// Avatar Studio — script plus optional title, format, resolution and voice. Kicks off one HeyGen video job
// and records it immediately (status PROCESSING — HeyGen has no separate
// "queued" state); completion is picked up by the webhook receiver, with
// the status-refresh route as a manual fallback for whenever the webhook
// endpoint isn't registered against this environment yet.
//
// avatarLookId selects which of the avatar's looks to render with — required
// for avatars imported from HeyGen (which always have at least one look).
// Avatars linked via the legacy manual admin flow have no looks at all and
// fall back to generating directly off Avatar.heygenAvatarId.
export async function generateAvatarVideo(
  userId: string,
  avatarId: string,
  script: string,
  avatarLookId?: string,
  engine: HeyGenEngine = "avatar_iii",
  options: GenerateVideoOptions = {},
): Promise<GenerateVideoResult> {
  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: {
      id: true,
      heygenAvatarId: true,
      status: true,
      looks: { select: { id: true, heygenLookId: true, status: true } },
    },
  });

  if (!avatar) {
    return { ok: false, code: "AVATAR_NOT_READY", error: "This avatar isn't ready to generate videos from yet." };
  }

  let heygenLookId: string | null;
  let resolvedLookId: string | null;

  if (avatar.looks.length > 0) {
    const look = avatarLookId ? avatar.looks.find((l) => l.id === avatarLookId) : undefined;
    if (!look || look.status !== "ready") {
      return { ok: false, code: "AVATAR_NOT_READY", error: "Pick a ready look to generate a video with." };
    }
    heygenLookId = look.heygenLookId;
    resolvedLookId = look.id;
  } else {
    if (!avatar.heygenAvatarId || avatar.status !== "ready") {
      return { ok: false, code: "AVATAR_NOT_READY", error: "This avatar isn't ready to generate videos from yet." };
    }
    heygenLookId = avatar.heygenAvatarId;
    resolvedLookId = null;
  }

  // A voice picked in the workspace wins; otherwise fall back to the look's
  // own default voice (the original behaviour).
  let voiceId: string | null = options.voiceId ?? null;
  if (!voiceId) {
    try {
      const look = await getHeyGenAvatarLook(heygenLookId);
      voiceId = look.default_voice_id;
    } catch (err) {
      const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
      return { ok: false, code: "HEYGEN_ERROR", error: `Couldn't look up this avatar: ${message}` };
    }
  }

  if (!voiceId) {
    return { ok: false, code: "NO_VOICE", error: "This avatar has no default voice set up yet." };
  }

  const prismaEngine = ENGINE_TO_PRISMA[engine];

  // Reserve credits before ever calling HeyGen — HeyGen doesn't report a
  // video's duration until it completes, so the only way to block "the
  // request that would push someone over their limit" (rather than just
  // the next one after) is to estimate and reserve upfront. See
  // lib/usage/ledger.ts.
  const reservation = await reserveCreditsForGeneration({ userId, engine: prismaEngine, script });
  if (!reservation.ok) {
    return {
      ok: false,
      code: "OVER_LIMIT",
      error: `You've used all your video credits for this billing period (resets ${reservation.periodEnd.toDateString()}).`,
      creditsUsedMilli: reservation.creditsUsedMilli,
      creditsLimitMilli: reservation.creditsLimitMilli,
      periodEnd: reservation.periodEnd.toISOString(),
    };
  }

  // Created before calling the provider, not after — so the row (and the
  // ledger entry's link to it) already exists by the time any webhook could
  // possibly reference it. heygenVideoId/status only arrive once the
  // provider actually accepts the job, via the update below. See
  // app/api/webhooks/heygen/route.ts's own comment on the matching half of
  // this fix.
  const generatedVideo = await prisma.generatedVideo.create({
    data: {
      userId,
      avatarId: avatar.id,
      avatarLookId: resolvedLookId,
      script,
      status: "PENDING" as VideoGenerationStatus,
      engine: prismaEngine,
      title: options.title,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      voiceId: options.voiceId,
      voiceName: options.voiceName,
    },
    select: { id: true },
  });

  await prisma.usageLedgerEntry.update({
    where: { id: reservation.ledgerEntryId },
    data: { videoId: generatedVideo.id },
  });

  try {
    const { video_id } = await createHeyGenVideo({
      avatarId: heygenLookId,
      script,
      voiceId,
      engine,
      callbackUrl: callbackUrl(),
      title: options.title,
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
    });

    await prisma.generatedVideo.update({
      where: { id: generatedVideo.id },
      data: { status: "PROCESSING" as VideoGenerationStatus, heygenVideoId: video_id },
    });

    return { ok: true, generatedVideoId: generatedVideo.id };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";

    // HeyGen never accepted the job — give the reserved credits back rather
    // than counting them against this billing period.
    await releaseReservation(reservation.ledgerEntryId);

    // Updates the row created above rather than creating a second one — it
    // already exists (and is already linked from the ledger entry).
    await prisma.generatedVideo.update({
      where: { id: generatedVideo.id },
      data: { status: "FAILED" as VideoGenerationStatus, errorMessage: message },
    });

    return { ok: false, code: "HEYGEN_ERROR", error: message };
  }
}

export type RefreshResult =
  | { ok: true; status: VideoGenerationStatus; videoUrl: string | null }
  | { ok: false; code: "NOT_FOUND" | "HEYGEN_ERROR"; error: string };

// On-demand fallback for whenever the webhook hasn't fired yet (or isn't
// registered against this environment at all) — re-fetches authoritative
// state from HeyGen rather than trusting anything the caller already has.
export async function refreshGeneratedVideoStatus(generatedVideoId: string, userId: string): Promise<RefreshResult> {
  const row = await prisma.generatedVideo.findFirst({
    where: { id: generatedVideoId, userId },
    select: { id: true, heygenVideoId: true, status: true, engine: true, resolution: true },
  });

  if (!row) return { ok: false, code: "NOT_FOUND", error: "Not found" };
  if (!row.heygenVideoId || row.status === "COMPLETED" || row.status === "FAILED") {
    return { ok: true, status: row.status, videoUrl: null };
  }

  try {
    const remote = await getHeyGenVideoStatus(row.heygenVideoId);
    const mapped = mapRemoteStatus(remote.status);

    // duration/cost only meaningful once actually completed — HeyGen's
    // status response has no cost field at all, so cost is always derived
    // from duration x this row's own engine rate (see lib/heygen/pricing.ts).
    const isCompleted = mapped === "COMPLETED";
    const durationSeconds = isCompleted ? (remote.duration ?? undefined) : undefined;

    const updated = await prisma.generatedVideo.update({
      where: { id: row.id },
      data: {
        status: mapped,
        videoUrl: remote.video_url ?? undefined,
        thumbnailUrl: remote.thumbnail_url ?? undefined,
        errorMessage: mapped === "FAILED" ? (remote.error?.message ?? "Video generation failed") : undefined,
        completedAt: mapped === "COMPLETED" || mapped === "FAILED" ? new Date() : undefined,
        durationSeconds,
        estimatedCostCents:
          durationSeconds !== undefined
            ? estimatedCostCents(row.engine, durationSeconds, row.resolution)
            : undefined,
      },
      select: { status: true, videoUrl: true },
    });

    if (isCompleted && durationSeconds !== undefined) {
      await reconcileCredits({ videoId: row.id, engine: row.engine, actualDurationSeconds: durationSeconds });
    } else if (mapped === "FAILED") {
      await releaseReservationForVideo(row.id);
    }

    return { ok: true, status: updated.status, videoUrl: updated.videoUrl };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    return { ok: false, code: "HEYGEN_ERROR", error: message };
  }
}

// Server-side "don't show stale status" helper for page loads. Without
// this, a PENDING/PROCESSING row only ever gets refreshed by the webhook
// (can be missed — see app/api/webhooks/heygen/route.ts), by client-side
// polling (only runs while that exact page is open in a tab), or by the
// once-daily stuck-generation sweep (sweepStuckGenerations below, which can
// take up to ~24h to catch something). Someone who queues a video, closes
// the tab, and checks back later from the videos list or a bookmark — not
// watching the in-progress loader — would otherwise see whatever was true
// at page-load time, stale for as long as nothing else happened to refresh
// it. Calling this on every relevant page load closes that gap directly.
// Best-effort: a page load should never break because HeyGen is slow or
// briefly unavailable — on failure this just leaves the DB (and therefore
// the page) showing whatever was already there, same as if this call were
// never made.
export async function refreshIfInProgress(
  row: { id: string; status: VideoGenerationStatus },
  userId: string,
): Promise<void> {
  if (row.status !== "PENDING" && row.status !== "PROCESSING") return;
  try {
    await refreshGeneratedVideoStatus(row.id, userId);
  } catch (err) {
    console.error(`Best-effort status refresh failed for video ${row.id}:`, err);
  }
}

function mapRemoteStatus(status: string): VideoGenerationStatus {
  switch (status) {
    case "completed":
      return "COMPLETED" as VideoGenerationStatus;
    case "failed":
      return "FAILED" as VideoGenerationStatus;
    case "processing":
      return "PROCESSING" as VideoGenerationStatus;
    default:
      return "PENDING" as VideoGenerationStatus;
  }
}

// HeyGen's video/thumbnail URLs are signed with an `Expires` query param
// (unix seconds) — confirmed against real stored rows to be roughly a
// 7-day window from generation. Returns null if the URL has no such param
// (unexpected shape) rather than treating that as "expired", so a parsing
// surprise doesn't cause needless refresh churn.
function getUrlExpiryMs(url: string): number | null {
  try {
    const expires = new URL(url).searchParams.get("Expires");
    if (!expires) return null;
    const seconds = Number(expires);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

const EXPIRY_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // refresh a day ahead of actual expiry

// Shared by the cron sweep and the single-video manual refresh below —
// re-fetches a COMPLETED video's status from HeyGen (which returns the
// same underlying file with a freshly-signed URL) and updates only
// videoUrl/thumbnailUrl; status/duration/cost are already final for a
// COMPLETED row and untouched here.
async function refetchVideoUrlFields(row: { id: string; heygenVideoId: string }) {
  const remote = await getHeyGenVideoStatus(row.heygenVideoId);
  return prisma.generatedVideo.update({
    where: { id: row.id },
    data: {
      videoUrl: remote.video_url ?? undefined,
      thumbnailUrl: remote.thumbnail_url ?? undefined,
    },
    select: { videoUrl: true, thumbnailUrl: true },
  });
}

export type RefreshExpiringUrlsResult = {
  checked: number;
  refreshed: number;
  failed: { generatedVideoId: string; error: string }[];
};

// Cron-triggered (see vercel.json) sweep of already-COMPLETED videos whose
// stored HeyGen URL has expired or is about to. Deliberately separate from
// refreshGeneratedVideoStatus above, which is a PENDING/PROCESSING-only
// polling fallback and short-circuits immediately for COMPLETED rows — that
// function was never meant to (and doesn't) re-sign a stale COMPLETED URL.
export async function refreshExpiringVideoUrls(): Promise<RefreshExpiringUrlsResult> {
  const rows = await prisma.generatedVideo.findMany({
    where: {
      status: "COMPLETED",
      videoUrl: { not: null },
      heygenVideoId: { not: null },
    },
    select: { id: true, heygenVideoId: true, videoUrl: true },
  });

  const now = Date.now();
  const dueForRefresh = rows.filter((row) => {
    const expiryMs = getUrlExpiryMs(row.videoUrl!);
    return expiryMs === null || expiryMs - now < EXPIRY_REFRESH_BUFFER_MS;
  });

  const failed: RefreshExpiringUrlsResult["failed"] = [];
  let refreshed = 0;

  for (const row of dueForRefresh) {
    try {
      await refetchVideoUrlFields({ id: row.id, heygenVideoId: row.heygenVideoId! });
      refreshed += 1;
    } catch (err) {
      const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
      failed.push({ generatedVideoId: row.id, error: message });
    }
  }

  return { checked: dueForRefresh.length, refreshed, failed };
}

// A webhook delivery that's missed for any reason (the delivery race
// between our own GeneratedVideo.create() and a very fast HeyGen render —
// see app/api/webhooks/heygen/route.ts's local-row lookup — a signature
// failure, a dropped delivery, anything) leaves a video stuck at PENDING/
// PROCESSING forever, with no automated path back: refreshExpiringVideoUrls
// above only ever touches already-COMPLETED rows, and the only other paths
// (an open browser tab polling, or someone manually revisiting the page)
// require a person to actually be looking. This is the reconciliation
// sweep that closes that gap.
const STUCK_GENERATION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export type SweepStuckGenerationsResult = {
  checked: number;
  resolved: number; // now COMPLETED or FAILED
  stillProcessing: number; // genuinely still rendering — left alone
  failed: { generatedVideoId: string; error: string }[];
};

// Threshold checked against real completion data (2026-11-07): p90 ~6 min,
// max ~12 min across 31 clean (non-stuck) completions — 30 minutes is well
// past any real render time seen so far, so this only ever catches rows
// that are actually stuck, never one that's merely slow.
export async function sweepStuckGenerations(): Promise<SweepStuckGenerationsResult> {
  const cutoff = new Date(Date.now() - STUCK_GENERATION_THRESHOLD_MS);

  const stuck = await prisma.generatedVideo.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] as VideoGenerationStatus[] },
      heygenVideoId: { not: null },
      createdAt: { lte: cutoff },
    },
    select: { id: true, heygenVideoId: true, engine: true, resolution: true },
  });

  let resolved = 0;
  let stillProcessing = 0;
  const failed: SweepStuckGenerationsResult["failed"] = [];

  for (const row of stuck) {
    try {
      const remote = await getHeyGenVideoStatus(row.heygenVideoId!);
      const mapped = mapRemoteStatus(remote.status);

      const isCompleted = mapped === "COMPLETED";
      const durationSeconds = isCompleted ? (remote.duration ?? undefined) : undefined;

      await prisma.generatedVideo.update({
        where: { id: row.id },
        data: {
          status: mapped,
          videoUrl: remote.video_url ?? undefined,
          thumbnailUrl: remote.thumbnail_url ?? undefined,
          errorMessage: mapped === "FAILED" ? (remote.error?.message ?? "Video generation failed") : undefined,
          completedAt: mapped === "COMPLETED" || mapped === "FAILED" ? new Date() : undefined,
          durationSeconds,
          estimatedCostCents:
            durationSeconds !== undefined ? estimatedCostCents(row.engine, durationSeconds, row.resolution) : undefined,
        },
      });

      if (isCompleted && durationSeconds !== undefined) {
        await reconcileCredits({ videoId: row.id, engine: row.engine, actualDurationSeconds: durationSeconds });
        resolved++;
      } else if (mapped === "FAILED") {
        await releaseReservationForVideo(row.id);
        resolved++;
      } else {
        // Genuinely still processing on HeyGen's side — leave it, the next
        // sweep (or an open tab's own polling) will catch it when it's done.
        stillProcessing++;
      }
    } catch (err) {
      const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
      failed.push({ generatedVideoId: row.id, error: message });
    }
  }

  return { checked: stuck.length, resolved, stillProcessing, failed };
}

export type RefreshVideoUrlResult =
  | { ok: true; videoUrl: string | null; thumbnailUrl: string | null }
  | { ok: false; code: "NOT_FOUND" | "NOT_COMPLETED" | "HEYGEN_ERROR"; error: string };

// Manual "just in case" fallback for a single COMPLETED video — the cron
// sweep above normally catches an expiring URL automatically, but Vercel
// Hobby's cron only runs once daily, so this gives an immediate on-demand
// path too, exposed as a "Refresh video" button in the dashboard.
export async function refreshVideoUrl(generatedVideoId: string, userId: string): Promise<RefreshVideoUrlResult> {
  const row = await prisma.generatedVideo.findFirst({
    where: { id: generatedVideoId, userId },
    select: { id: true, heygenVideoId: true, status: true },
  });

  if (!row) return { ok: false, code: "NOT_FOUND", error: "Not found" };
  if (row.status !== "COMPLETED" || !row.heygenVideoId) {
    return { ok: false, code: "NOT_COMPLETED", error: "Video isn't ready yet" };
  }

  try {
    const updated = await refetchVideoUrlFields({ id: row.id, heygenVideoId: row.heygenVideoId });
    return { ok: true, videoUrl: updated.videoUrl, thumbnailUrl: updated.thumbnailUrl };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    return { ok: false, code: "HEYGEN_ERROR", error: message };
  }
}
