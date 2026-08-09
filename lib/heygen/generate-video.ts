import prisma from "@/lib/prisma";
import { getHeyGenAvatarLook, getHeyGenVideoStatus, createHeyGenVideo, HeyGenApiError } from "@/lib/heygen";
import type { VideoGenerationStatus } from "@/app/generated/prisma/enums";

export type GenerateVideoResult =
  | { ok: true; generatedVideoId: string }
  | { ok: false; code: "AVATAR_NOT_READY" | "NO_VOICE" | "HEYGEN_ERROR"; error: string };

function callbackUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.includes("localhost")) return undefined; // HeyGen can't reach a local URL
  return `${appUrl}/api/webhooks/heygen`;
}

// Avatar Studio v1 — script only, avatar's own default HeyGen voice, no
// background/aspect-ratio controls. Kicks off one HeyGen video job and
// records it immediately (status PROCESSING — HeyGen has no separate
// "queued" state); completion is picked up by the webhook receiver, with
// the status-refresh route as a manual fallback for whenever the webhook
// endpoint isn't registered against this environment yet.
export async function generateAvatarVideo(
  userId: string,
  avatarId: string,
  script: string,
): Promise<GenerateVideoResult> {
  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
    select: { id: true, heygenAvatarId: true, status: true },
  });

  if (!avatar || !avatar.heygenAvatarId || avatar.status !== "ready") {
    return { ok: false, code: "AVATAR_NOT_READY", error: "This avatar isn't ready to generate videos from yet." };
  }

  let voiceId: string | null;
  try {
    const look = await getHeyGenAvatarLook(avatar.heygenAvatarId);
    voiceId = look.default_voice_id;
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    return { ok: false, code: "HEYGEN_ERROR", error: `Couldn't look up this avatar in HeyGen: ${message}` };
  }

  if (!voiceId) {
    return { ok: false, code: "NO_VOICE", error: "This avatar has no default voice configured in HeyGen yet." };
  }

  try {
    const { video_id } = await createHeyGenVideo({
      avatarId: avatar.heygenAvatarId,
      script,
      voiceId,
      callbackUrl: callbackUrl(),
    });

    const generatedVideo = await prisma.generatedVideo.create({
      data: {
        userId,
        avatarId: avatar.id,
        script,
        status: "PROCESSING" as VideoGenerationStatus,
        heygenVideoId: video_id,
      },
      select: { id: true },
    });

    return { ok: true, generatedVideoId: generatedVideo.id };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";

    // Never leave this silently unbilled-for-nothing — record the failed
    // attempt (no heygenVideoId, since HeyGen never accepted the job) so it
    // shows in the user's history with a clear reason instead of vanishing.
    await prisma.generatedVideo.create({
      data: {
        userId,
        avatarId: avatar.id,
        script,
        status: "FAILED" as VideoGenerationStatus,
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
    select: { id: true, heygenVideoId: true, status: true },
  });

  if (!row) return { ok: false, code: "NOT_FOUND", error: "Not found" };
  if (!row.heygenVideoId || row.status === "COMPLETED" || row.status === "FAILED") {
    return { ok: true, status: row.status, videoUrl: null };
  }

  try {
    const remote = await getHeyGenVideoStatus(row.heygenVideoId);
    const mapped = mapRemoteStatus(remote.status);

    const updated = await prisma.generatedVideo.update({
      where: { id: row.id },
      data: {
        status: mapped,
        videoUrl: remote.video_url ?? undefined,
        thumbnailUrl: remote.thumbnail_url ?? undefined,
        errorMessage: mapped === "FAILED" ? (remote.error?.message ?? "Video generation failed") : undefined,
        completedAt: mapped === "COMPLETED" || mapped === "FAILED" ? new Date() : undefined,
      },
      select: { status: true, videoUrl: true },
    });

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
