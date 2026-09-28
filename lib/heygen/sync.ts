import prisma from "@/lib/prisma";
import { getHeyGenAvatar, getHeyGenAvatarLook, HeyGenApiError, type HeyGenAvatar, type HeyGenAvatarLook } from "@/lib/heygen";

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

function isNotFound(err: unknown): boolean {
  return err instanceof HeyGenApiError && (err.status === 404 || err.code === "avatar_not_found");
}

// Legacy path — avatars linked via the manual admin "Link Avatar" flow have
// no AvatarLook rows at all and sync directly off Avatar.heygenAvatarId.
//
// That field used to always be a look id (confirmed identical to the v2
// avatar_id for older avatars — see HeyGenAvatarLook's comment in
// lib/heygen.ts), so trying it as a look id first is still correct for
// every avatar imported that way. Confirmed live on 2026-09-28 that this
// stopped holding for at least one newer avatar, whose HeyGen id is a
// top-level Avatar id instead — a genuine "not found" on the look lookup
// now falls back to the avatar-level one, rather than leaving the row stuck
// on its last-known (often still "pending") status forever.
export async function syncAvatarFromHeyGen(
  avatarId: string,
  heygenAvatarId: string,
): Promise<AvatarSyncResult> {
  let look: HeyGenAvatarLook | HeyGenAvatar;
  try {
    look = await getHeyGenAvatarLook(heygenAvatarId);
  } catch (lookErr) {
    if (!isNotFound(lookErr)) {
      const message = lookErr instanceof HeyGenApiError ? lookErr.message : "Unknown error syncing avatar";
      console.error(`HeyGen sync failed for avatar ${avatarId} (heygenAvatarId ${heygenAvatarId}):`, message);
      return { ok: false, error: message };
    }
    try {
      look = await getHeyGenAvatar(heygenAvatarId);
    } catch (avatarErr) {
      const message = avatarErr instanceof HeyGenApiError ? avatarErr.message : "Unknown error syncing avatar";
      console.error(
        `HeyGen sync failed for avatar ${avatarId} (heygenAvatarId ${heygenAvatarId}) as both a look and a plain avatar:`,
        message,
      );
      return { ok: false, error: message };
    }
  }

  try {
    const mappedStatus = mapHeyGenStatus(look.status);
    const videoUrl = "preview_video_url" in look ? look.preview_video_url : undefined;

    await prisma.avatar.update({
      where: { id: avatarId },
      data: {
        previewUrl: look.preview_image_url ?? undefined,
        videoUrl: videoUrl ?? undefined,
        ...(mappedStatus ? { status: mappedStatus } : {}),
      },
    });

    return {
      ok: true,
      status: mappedStatus,
      previewUrl: look.preview_image_url ?? null,
      videoUrl: videoUrl ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error saving synced avatar";
    console.error(`Failed to save synced HeyGen data for avatar ${avatarId}:`, message);
    return { ok: false, error: message };
  }
}

// Checked from the admin "Link Avatar" form before saving a manually-typed
// HeyGen id, so a mistyped or wrong-kind-of id is caught immediately with a
// clear reason instead of silently creating a row that will never sync (see
// syncAvatarFromHeyGen's comment for the incident that prompted this — a
// valid id was rejected as "not found" for weeks because it happened to be
// an avatar id rather than a look id, and nothing checked either way at
// entry time).
export async function verifyHeygenAvatarId(heygenAvatarId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getHeyGenAvatarLook(heygenAvatarId);
    return { ok: true };
  } catch (lookErr) {
    if (!isNotFound(lookErr)) {
      const message = lookErr instanceof HeyGenApiError ? lookErr.message : "Could not reach HeyGen to verify this id.";
      return { ok: false, error: message };
    }
    try {
      await getHeyGenAvatar(heygenAvatarId);
      return { ok: true };
    } catch (avatarErr) {
      if (isNotFound(avatarErr)) {
        return { ok: false, error: "HeyGen doesn't recognise this id, as either an avatar or a look. Double-check it was copied correctly." };
      }
      const message = avatarErr instanceof HeyGenApiError ? avatarErr.message : "Could not reach HeyGen to verify this id.";
      return { ok: false, error: message };
    }
  }
}

// Only the fields the rollup itself reads — callers (dashboard grid, admin
// panel) commonly select more (id, name, …) for their own rendering, and a
// fuller object satisfies this structurally without extra mapping.
export type RolledUpLook = {
  status: string;
  previewUrl: string | null;
  videoUrl?: string | null;
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
  if (ready) return { status: "ready", previewUrl: ready.previewUrl, videoUrl: ready.videoUrl ?? null };
  return { status: looks[0].status, previewUrl: looks[0].previewUrl, videoUrl: looks[0].videoUrl ?? null };
}
