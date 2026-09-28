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

// Manual look-linking, for avatars HeyGen's own group-import machinery can't
// see. Confirmed live on 2026-09-28: for at least one newer avatar, the
// legacy /v2/avatar_group/{id}/avatars endpoint that lib/heygen/import-
// avatars.ts's bulk import relies on 404s outright ("Avatar group not
// found"), and the v3 list-looks endpoint's own group_id filter — despite
// HeyGen's documentation saying it should return exactly this — silently
// returns an empty list. Both are HeyGen-side gaps, not something more
// client-side filtering/pagination can work around. GET /v3/avatars/looks/
// {look_id} (single lookup, not list) does reliably resolve a known look id
// for this same avatar, so that's the one thing this can lean on: an admin
// supplies a look id they already have (e.g. from HeyGen's own dashboard),
// and this fetches + verifies it before saving, rather than trusting it
// blindly the way a raw DB insert would.
export async function addAvatarLookFromHeyGen(
  avatarId: string,
  heygenLookId: string,
): Promise<{ ok: true; lookId: string } | { ok: false; error: string }> {
  const avatar = await prisma.avatar.findUnique({
    where: { id: avatarId },
    select: { heygenAvatarId: true, heygenGroupId: true },
  });
  if (!avatar) return { ok: false, error: "Avatar not found" };

  const identityId = avatar.heygenGroupId ?? avatar.heygenAvatarId;
  if (!identityId) {
    return { ok: false, error: "Link this avatar's own HeyGen id first, then add its looks." };
  }

  let look: HeyGenAvatarLook;
  try {
    look = await getHeyGenAvatarLook(heygenLookId);
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: "HeyGen doesn't recognise this look id. Double-check it was copied correctly." };
    }
    const message = err instanceof HeyGenApiError ? err.message : "Could not reach HeyGen to verify this look.";
    return { ok: false, error: message };
  }

  // The one safety check that matters here — without it, a mistyped or
  // copy-pasted-from-the-wrong-tab id would silently attach a different
  // client's likeness to this user's avatar.
  if (look.group_id && look.group_id !== identityId) {
    return { ok: false, error: "This look belongs to a different avatar identity in HeyGen — refusing to link it here." };
  }

  try {
    const created = await prisma.avatarLook.create({
      data: {
        avatarId,
        heygenLookId,
        name: look.name,
        status: mapHeyGenStatus(look.status) ?? "pending",
        previewUrl: look.preview_image_url ?? undefined,
        videoUrl: look.preview_video_url ?? undefined,
        defaultVoiceId: look.default_voice_id ?? undefined,
      },
      select: { id: true },
    });
    return { ok: true, lookId: created.id };
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return { ok: false, error: "This look is already linked to an avatar." };
    }
    const message = err instanceof Error ? err.message : "Unknown error saving this look";
    return { ok: false, error: message };
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
