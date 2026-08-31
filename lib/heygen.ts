const HEYGEN_API_BASE = "https://api.heygen.com";

// Matches GET /v3/avatars/looks/{look_id} — the "look_id" is the same value
// stored as Avatar.heygenAvatarId (confirmed against the real HeyGen
// account: it's identical to the avatar_id returned by the v2 list-avatars
// endpoint). status is documented as present only for private/custom
// avatars, which is what every YouMimic client avatar is.
export interface HeyGenAvatarLook {
  id: string;
  name: string;
  avatar_type: string;
  group_id: string | null;
  preview_image_url: string | null;
  preview_video_url: string | null;
  default_voice_id: string | null;
  status: "processing" | "pending_consent" | "failed" | "completed" | null;
  error: { code: string; message: string } | null;
}

// Matches GET /v3/videos/{video_id} — used both for Avatar Studio's manual
// status-refresh fallback and by the webhook handler (which re-fetches
// authoritative state rather than trusting webhook payload fields, per
// HeyGen's own guidance for failure events).
export interface HeyGenVideoStatus {
  video_id?: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url: string | null;
  thumbnail_url: string | null;
  // Seconds, only meaningful once status is "completed" — confirmed via a
  // real API response that this endpoint returns duration but no
  // credit/cost figure (see lib/heygen/pricing.ts for how cost is derived
  // from this instead).
  duration: number | null;
  error: { code?: string; message?: string } | null;
}

export class HeyGenApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HeyGenApiError";
  }
}

function heygenApiKey(): string {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey || apiKey === "...") {
    throw new HeyGenApiError("HEYGEN_API_KEY is not configured");
  }
  return apiKey;
}

// 8s timeout on every call — several of these run from page render paths
// (see app/(dashboard)/dashboard/avatars/page.tsx), so a slow/hanging
// HeyGen request must never be allowed to stall a page indefinitely.
async function heygenFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = heygenApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${HEYGEN_API_BASE}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const message = json?.error?.message ?? `HeyGen API returned ${res.status}`;
      throw new HeyGenApiError(message, json?.error?.code, res.status);
    }

    return (json?.data ?? json) as T;
  } catch (err) {
    if (err instanceof HeyGenApiError) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new HeyGenApiError(`HeyGen request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHeyGenAvatarLook(lookId: string): Promise<HeyGenAvatarLook> {
  return heygenFetch<HeyGenAvatarLook>(`/v3/avatars/looks/${encodeURIComponent(lookId)}`);
}

export async function getHeyGenVideoStatus(videoId: string): Promise<HeyGenVideoStatus> {
  return heygenFetch<HeyGenVideoStatus>(`/v3/videos/${encodeURIComponent(videoId)}`);
}

// POST /v3/videos — confirmed against the real API via safe validation
// probes (deliberately invalid bodies that error before ever reaching
// generation, so nothing was created and no credits were spent): requires
// type: "avatar", avatar_id, script, and voice_id (an audio_url/
// audio_asset_id pair is the alternative HeyGen supports, unused here since
// Avatar Studio v1 is script-only). Returns a video_id synchronously —
// HeyGen has no separate "queued" state, the job starts processing
// immediately.
export type HeyGenEngine = "avatar_iii" | "avatar_iv" | "avatar_v";

export async function createHeyGenVideo(params: {
  avatarId: string;
  script: string;
  voiceId: string;
  engine: HeyGenEngine;
  callbackUrl?: string;
}): Promise<{ video_id: string }> {
  return heygenFetch<{ video_id: string }>("/v3/videos", {
    method: "POST",
    body: JSON.stringify({
      type: "avatar",
      avatar_id: params.avatarId,
      script: params.script,
      voice_id: params.voiceId,
      // HeyGen expects "engine" as a discriminated object, not a plain
      // string — confirmed against the real API: a bare string produces
      // "Input should be a valid dictionary or object to extract fields
      // from", and an empty object confirms "type" as the discriminator
      // field ("Unable to extract tag using discriminator 'type'").
      engine: { type: params.engine },
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    }),
  });
}

// DELETE /v3/videos/{video_id} — not listed on HeyGen's docs site (which
// 404s on the reference page), but confirmed live: a too-short id 400s with
// "Video ID must be at least 32 characters" and a well-formed-but-unknown
// id 404s with "video_not_found", so the route is real and does an actual
// existence check rather than silently no-op'ing. Callers should treat a
// video_not_found 404 as an acceptable outcome (already gone on HeyGen's
// side), not a failure.
export async function deleteHeyGenVideo(videoId: string): Promise<void> {
  await heygenFetch<unknown>(`/v3/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
}
