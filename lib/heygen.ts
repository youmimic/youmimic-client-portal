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
  status: "processing" | "pending_consent" | "failed" | "completed" | null;
  error: { code: string; message: string } | null;
}

export class HeyGenApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HeyGenApiError";
  }
}

// 8s timeout — this is called from a page render path (see
// app/(dashboard)/dashboard/avatars/page.tsx), so a slow/hanging HeyGen
// request must not be allowed to stall the page indefinitely.
export async function getHeyGenAvatarLook(lookId: string): Promise<HeyGenAvatarLook> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey || apiKey === "...") {
    throw new HeyGenApiError("HEYGEN_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${HEYGEN_API_BASE}/v3/avatars/looks/${encodeURIComponent(lookId)}`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new HeyGenApiError(`HeyGen API returned ${res.status}`, res.status);
    }

    const json = (await res.json()) as { data: HeyGenAvatarLook };
    return json.data;
  } catch (err) {
    if (err instanceof HeyGenApiError) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new HeyGenApiError(`HeyGen request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
