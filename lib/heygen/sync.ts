import prisma from "@/lib/prisma";
import { getHeyGenAvatarLook, HeyGenApiError, type HeyGenAvatarLook } from "@/lib/heygen";

export type AvatarSyncResult =
  | { ok: true; status: string | null; previewUrl: string | null; videoUrl: string | null }
  | { ok: false; error: string };

// completed -> ready reuses the existing status vocabulary (STATUS_STYLES
// already has a "ready" treatment). pending_consent is kept distinct rather
// than collapsed into "pending" — it's an actionable state (the avatar
// subject needs to record consent in HeyGen) that a generic "queued" pending
// doesn't communicate. null means HeyGen didn't report a status for this
// avatar (only present for private avatars per HeyGen's docs) — in that
// case the existing DB status is left untouched rather than guessed.
function mapHeyGenStatus(status: HeyGenAvatarLook["status"]): string | null {
  switch (status) {
    case "completed":
      return "ready";
    case "processing":
      return "processing";
    case "pending_consent":
      return "pending_consent";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

// Best-effort, write-through sync for one look: fetches live details from
// HeyGen and persists preview/video/status/voice into our own AvatarLook row
// so other readers (dashboard, admin, Avatar Studio) see the same data
// without re-hitting the HeyGen API themselves. Never throws — HeyGen being
// slow or down must degrade to "keep showing last-known DB values", not
// break the page that called this.
export async function syncAvatarLookFromHeyGen(
  avatarLookId: string,
  heygenLookId: string,
): Promise<AvatarSyncResult> {
  try {
    const look = await getHeyGenAvatarLook(heygenLookId);
    const mappedStatus = mapHeyGenStatus(look.status);

    await prisma.avatarLook.update({
      where: { id: avatarLookId },
      data: {
        previewUrl: look.preview_image_url ?? undefined,
        videoUrl: look.preview_video_url ?? undefined,
        defaultVoiceId: look.default_voice_id ?? undefined,
        ...(mappedStatus ? { status: mappedStatus } : {}),
      },
    });

    return {
      ok: true,
      status: mappedStatus,
      previewUrl: look.preview_image_url ?? null,
      videoUrl: look.preview_video_url ?? null,
    };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error syncing avatar look";
    console.error(`HeyGen sync failed for look ${avatarLookId} (heygenLookId ${heygenLookId}):`, message);
    return { ok: false, error: message };
  }
}

// Legacy path — avatars linked via the manual admin "Link Avatar" flow have
// no AvatarLook rows at all and sync directly off Avatar.heygenAvatarId.
export async function syncAvatarFromHeyGen(
  avatarId: string,
  heygenAvatarId: string,
): Promise<AvatarSyncResult> {
  try {
    const look = await getHeyGenAvatarLook(heygenAvatarId);
    const mappedStatus = mapHeyGenStatus(look.status);

    await prisma.avatar.update({
      where: { id: avatarId },
      data: {
        previewUrl: look.preview_image_url ?? undefined,
        videoUrl: look.preview_video_url ?? undefined,
        ...(mappedStatus ? { status: mappedStatus } : {}),
      },
    });

    return {
      ok: true,
      status: mappedStatus,
      previewUrl: look.preview_image_url ?? null,
      videoUrl: look.preview_video_url ?? null,
    };
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error syncing avatar";
    console.error(`HeyGen sync failed for avatar ${avatarId} (heygenAvatarId ${heygenAvatarId}):`, message);
    return { ok: false, error: message };
  }
}

export type RolledUpLook = {
  id: string;
  name: string;
  status: string;
  previewUrl: string | null;
  videoUrl: string | null;
};

// Identity-level display status/preview/video derived from its looks: "ready"
// if any look is ready (a client only needs one usable look to generate a
// video), otherwise the first look's own status. Used by the dashboard grid
// card and anywhere else that needs a single status/thumbnail/clip per avatar
// rather than per look.
export function rollupAvatarDisplay(
  looks: RolledUpLook[],
): { status: string; previewUrl: string | null; videoUrl: string | null } {
  if (looks.length === 0) return { status: "pending", previewUrl: null, videoUrl: null };
  const ready = looks.find((l) => l.status === "ready");
  if (ready) return { status: "ready", previewUrl: ready.previewUrl, videoUrl: ready.videoUrl };
  return { status: looks[0].status, previewUrl: looks[0].previewUrl, videoUrl: looks[0].videoUrl };
}
