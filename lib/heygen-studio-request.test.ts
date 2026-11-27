import { afterEach, describe, expect, it, vi } from "vitest";

// The exact studio request body for avatar scenes. The background shape is
// the one verified with real renders on 2026-11-26 (photo and video).
import { createHeyGenStudioVideo } from "@/lib/heygen";

function captureBody() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { video_id: "v1" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("HEYGEN_API_KEY", "test-key");
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("studio avatar scene request", () => {
  it("cuts the avatar out and sets a photo or video background", async () => {
    const body = captureBody();
    await createHeyGenStudioVideo({
      engine: "avatar_iii",
      scenes: [
        { kind: "avatar", avatarId: "look1", script: "Hi.", voiceId: "v", background: { kind: "image", url: "https://b/photo.jpg" } },
        { kind: "avatar", avatarId: "look1", script: "Hi.", voiceId: "v", background: { kind: "video", url: "https://b/clip.mp4" } },
      ],
    });
    const [photo, clip] = body().scenes;
    expect(photo.input).toMatchObject({
      remove_background: true,
      background: { type: "image", source: { type: "url", url: "https://b/photo.jpg" } },
    });
    expect(clip.input).toMatchObject({
      remove_background: true,
      background: { type: "video", source: { type: "url", url: "https://b/clip.mp4" } },
    });
  });

  it("sends neither field without a background (unchanged request)", async () => {
    const body = captureBody();
    await createHeyGenStudioVideo({ engine: "avatar_iii", scenes: [{ kind: "avatar", avatarId: "look1", script: "Hi.", voiceId: "v" }] });
    const input = body().scenes[0].input;
    expect("remove_background" in input).toBe(false);
    expect("background" in input).toBe(false);
  });
});
