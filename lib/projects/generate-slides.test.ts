import { beforeEach, describe, expect, it, vi } from "vitest";

// generateProject with Slide + narration scenes, against a mocked database,
// provider, credit ledger and slide storage, so the scene-to-payload mapping
// is checked without rendering anything. Same mocking style as
// generate.test.ts.

const db = vi.hoisted(() => ({
  videoProject: { findFirst: vi.fn(), updateMany: vi.fn() },
  avatar: { findMany: vi.fn() },
  generatedVideo: { create: vi.fn(), update: vi.fn() },
  usageLedgerEntry: { update: vi.fn() },
}));
const heygen = vi.hoisted(() => ({ createHeyGenStudioVideo: vi.fn(), getHeyGenAvatarLook: vi.fn() }));
const ledger = vi.hoisted(() => ({ reserveCreditsForGeneration: vi.fn(), releaseReservation: vi.fn() }));
const slides = vi.hoisted(() => ({ slideRenditionUrl: vi.fn() }));
const avatarOption = vi.hoisted(() => ({
  id: "av1",
  name: "Neil",
  previewUrl: null,
  usable: true,
  isPublic: false,
  avatarType: null,
  looks: [{ id: "lk1", name: "Suit", ready: true, previewUrl: null, videoUrl: null, defaultVoiceId: "voice-neil", avatarType: null, backgroundRemoval: "UNKNOWN" }],
}));

vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/heygen", async (orig) => ({ ...(await orig<typeof import("@/lib/heygen")>()), ...heygen }));
vi.mock("@/lib/usage/ledger", () => ledger);
vi.mock("@/lib/slides/images", async (orig) => ({ ...(await orig<typeof import("@/lib/slides/images")>()), ...slides }));
vi.mock("@/lib/projects/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/projects/service")>()),
  listAvatarOptions: vi.fn(async () => [avatarOption]),
  listPublicAvatarOptions: vi.fn(async () => []),
}));

import { generateProject } from "@/lib/projects/generate";
import { SlideImageError } from "@/lib/slides/images";

const slideImage = { id: "img1", url: "https://blob.example/slides/u/1.jpg", width: 1600, height: 1200 };

function scene(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `s${i}`,
    orderIndex: i,
    title: "",
    script: `Scene ${i + 1} narration.`,
    kind: "AVATAR",
    avatarId: "av1",
    avatarLookId: "lk1",
    voiceId: "voice-1",
    voiceName: "Emma",
    backgroundColor: null,
    mediaUrl: null,
    mediaDurationSeconds: null,
    motionPrompt: null,
    slideImageId: null,
    slideImage: null,
    sourcePageNumber: null,
    backgroundMediaId: null,
    backgroundMedia: null,
    ...over,
  };
}

const slideScene = (i: number, over: Record<string, unknown> = {}) =>
  scene(i, { kind: "SLIDE", slideImageId: slideImage.id, slideImage, ...over });

function project(scenes: ReturnType<typeof scene>[]) {
  return {
    id: "p1",
    userId: "u1",
    title: "Deck",
    status: "DRAFT",
    aspectRatio: "16:9",
    resolution: null,
    engine: "AVATAR_III",
    captionsEnabled: true,
    watermarkUrl: "https://blob.example/wm.png",
    watermarkPosition: "BOTTOM_RIGHT",
    defaultAvatarId: null,
    defaultAvatarLookId: null,
    defaultVoiceId: null,
    defaultVoiceName: null,
    scenes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.videoProject.updateMany.mockResolvedValue({ count: 1 });
  db.avatar.findMany.mockResolvedValue([
    { id: "av1", name: "Neil", heygenAvatarId: "hg-avatar", isPublic: false, looks: [{ id: "lk1", heygenLookId: "hg-look-1", status: "ready" }] },
  ]);
  db.generatedVideo.create.mockResolvedValue({ id: "vid1" });
  ledger.reserveCreditsForGeneration.mockResolvedValue({ ok: true, ledgerEntryId: "le1" });
  heygen.createHeyGenStudioVideo.mockResolvedValue({ video_id: "hg-video" });
  heygen.getHeyGenAvatarLook.mockResolvedValue({ default_voice_id: "voice-neil" });
  slides.slideRenditionUrl.mockResolvedValue("https://blob.example/slides/u/1-16x9.jpg");
});

describe("generateProject with Slide + narration scenes", () => {
  it("sends Avatar, then Slide + narration, then Avatar as one ordered studio job", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0), slideScene(1), scene(2)]));

    const result = await generateProject("u1", "p1", 3);

    expect(result).toEqual({ ok: true, generatedVideoId: "vid1" });
    const call = heygen.createHeyGenStudioVideo.mock.calls[0][0];
    expect(call.scenes.map((s: { kind: string }) => s.kind)).toEqual(["avatar", "image", "avatar"]);
    expect(call.scenes[1]).toEqual({
      kind: "image",
      mediaUrl: "https://blob.example/slides/u/1-16x9.jpg",
      script: "Scene 2 narration.",
      voiceId: "voice-1",
    });
    // Whole-video settings are unchanged.
    expect(call).toMatchObject({ aspectRatio: "16:9", captions: true, watermarkUrl: "https://blob.example/wm.png" });
    // The letterboxed copy is made for the project's own aspect ratio.
    expect(slides.slideRenditionUrl).toHaveBeenCalledWith("u1", "img1", "16:9");
    // Narration is charged: credits are reserved over every scene's script.
    expect(ledger.reserveCreditsForGeneration.mock.calls[0][0].script).toContain("Scene 2 narration.");
  });

  it("narrates a slide with the scene's avatar's own voice when no voice is chosen", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0), slideScene(1, { voiceId: null, voiceName: null })]));

    await generateProject("u1", "p1", 1);

    expect(heygen.getHeyGenAvatarLook).toHaveBeenCalledWith("hg-look-1");
    expect(heygen.createHeyGenStudioVideo.mock.calls[0][0].scenes[1].voiceId).toBe("voice-neil");
  });

  it("rejects a slide scene with no slide image before anything is submitted", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0), scene(1, { kind: "SLIDE" })]));

    const result = await generateProject("u1", "p1", 1);

    expect(result).toMatchObject({ ok: false, code: "NOT_READY" });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
  });

  it("reports an unreachable slide image and puts the project back, without submitting", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0), slideScene(1)]));
    slides.slideRenditionUrl.mockRejectedValue(new SlideImageError("A slide image couldn't be loaded. Replace it and try again."));

    const result = await generateProject("u1", "p1", 1);

    expect(result).toEqual({ ok: false, code: "BAD_MEDIA", error: "A slide image couldn't be loaded. Replace it and try again." });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
    // The GENERATING claim is reverted.
    expect(db.videoProject.updateMany.mock.calls.at(-1)?.[0].data).toEqual({ status: "DRAFT" });
  });

  it("generates a video made only of narrated slides, linked to no avatar", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([slideScene(0), slideScene(1, { script: "Second slide." })]));

    const result = await generateProject("u1", "p1", 2);

    expect(result).toEqual({ ok: true, generatedVideoId: "vid1" });
    const call = heygen.createHeyGenStudioVideo.mock.calls[0][0];
    expect(call.scenes.map((s: { kind: string }) => s.kind)).toEqual(["image", "image"]);
    expect(call.scenes.every((s: { script: string; voiceId: string }) => s.script && s.voiceId)).toBe(true);
    expect(db.generatedVideo.create.mock.calls[0][0].data.avatarId).toBeNull();
    // Narration is still charged on a slides-only video.
    expect(ledger.reserveCreditsForGeneration.mock.calls[0][0].script).toContain("Second slide.");
  });

  it("refuses a slides-only video whose slide has no voice and no avatar to borrow one from", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([slideScene(0, { voiceId: null, voiceName: null, avatarId: null, avatarLookId: null })]));

    const result = await generateProject("u1", "p1", 1);

    expect(result).toMatchObject({ ok: false });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
  });

  it("leaves avatar-only projects exactly as before", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0), scene(1)]));

    await generateProject("u1", "p1", 1);

    expect(slides.slideRenditionUrl).not.toHaveBeenCalled();
    expect(heygen.createHeyGenStudioVideo.mock.calls[0][0].scenes).toEqual([
      { kind: "avatar", avatarId: "hg-look-1", script: "Scene 1 narration.", voiceId: "voice-1", backgroundColor: null, motionPrompt: null, voiceLocale: null },
      { kind: "avatar", avatarId: "hg-look-1", script: "Scene 2 narration.", voiceId: "voice-1", backgroundColor: null, motionPrompt: null, voiceLocale: null },
    ]);
  });
});
