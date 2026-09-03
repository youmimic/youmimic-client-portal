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

export type GenerateVideoResult =
  | { ok: true; generatedVideoId: string }
  | {
      ok: false;
      code: "AVATAR_NOT_READY" | "NO_VOICE" | "HEYGEN_ERROR" | "OVER_LIMIT";
      error: string;
    };

function callbackUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.includes("localhost")) return undefined; // HeyGen can't reach a local URL
  return `${appUrl}/api/webhooks/heygen`;
}

// Avatar Studio v1 — script only, the chosen look's own default HeyGen
// voice, no background/aspect-ratio controls. Kicks off one HeyGen video job
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

  let voiceId: string | null;
  try {
    const look = await getHeyGenAvatarLook(heygenLookId);
    voiceId = look.default_voice_id;
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    return { ok: false, code: "HEYGEN_ERROR", error: `Couldn't look up this avatar in HeyGen: ${message}` };
  }

  if (!voiceId) {
    return { ok: false, code: "NO_VOICE", error: "This avatar has no default voice configured in HeyGen yet." };
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
    };
  }

  try {
    const { video_id } = await createHeyGenVideo({
      avatarId: heygenLookId,
      script,
      voiceId,
      engine,
      callbackUrl: callbackUrl(),
    });

    const generatedVideo = await prisma.generatedVideo.create({
      data: {
        userId,
        avatarId: avatar.id,
        avatarLookId: resolvedLookId,
        script,
        status: "PROCESSING" as VideoGenerationStatus,
        engine: prismaEngine,
        heygenVideoId: video_id,
      },
      select: { id: true },
    });

    await prisma.usageLedgerEntry.update({
      where: { id: reservation.ledgerEntryId },
      data: { videoId: generatedVideo.id },
    });

    return { ok: true, generatedVideoId: generatedVideo.id };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";

    // HeyGen never accepted the job — give the reserved credits back rather
    // than counting them against this billing period.
    await releaseReservation(reservation.ledgerEntryId);

    // Never leave this silently unbilled-for-nothing — record the failed
    // attempt (no heygenVideoId, since HeyGen never accepted the job) so it
    // shows in the user's history with a clear reason instead of vanishing.
    await prisma.generatedVideo.create({
      data: {
        userId,
        avatarId: avatar.id,
        avatarLookId: resolvedLookId,
        script,
        status: "FAILED" as VideoGenerationStatus,
        engine: prismaEngine,
        errorMessage: message,
      },
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
    select: { id: true, heygenVideoId: true, status: true, engine: true },
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
            ? estimatedCostCents(row.engine, durationSeconds)
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
