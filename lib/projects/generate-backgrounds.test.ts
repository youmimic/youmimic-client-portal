import { beforeEach, describe, expect, it, vi } from "vitest";

// generateProject with a custom photo/video background on avatar scenes,
// against a mocked database, provider and credit ledger. Same mocking style
// as generate-slides.test.ts.

const db = vi.hoisted(() => ({
  videoProject: { findFirst: vi.fn(), updateMany: vi.fn() },
  avatar: { findMany: vi.fn() },
  avatarLook: { update: vi.fn() },
  generatedVideo: { create: vi.fn(), update: vi.fn() },
  usageLedgerEntry: { update: vi.fn() },
}));
const heygen = vi.hoisted(() => ({ createHeyGenStudioVideo: vi.fn(), getHeyGenAvatarLook: vi.fn() }));
const ledger = vi.hoisted(() => ({ reserveCreditsForGeneration: vi.fn(), releaseReservation: vi.fn() }));
const support = vi.hoisted(() => ({ value: "SUPPORTED" as "SUPPORTED" | "UNKNOWN" | "UNSUPPORTED" }));

vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/heygen", async (orig) => ({ ...(await orig<typeof import("@/lib/heygen")>()), ...heygen }));
vi.mock("@/lib/usage/ledger", () => ledger);
// The adjusted-copy step (sharp + Blob) is tested on its own; here it returns
// a recognisable URL when a scene has adjustments.
vi.mock("@/lib/backgrounds/renditions", () => ({
  adjustedBackgroundUrl: vi.fn(async (_u: string, id: string, adjust: unknown) =>
    adjust ? `https://x.public.blob.vercel-storage.com/backgrounds/u1/adjusted-${id}.jpg` : id === "bg1" ? "https://x.public.blob.vercel-storage.com/backgrounds/u1/office.jpg" : "https://x.public.blob.vercel-storage.com/backgrounds/u1/sea.mp4",
  ),
}));
vi.mock("@/lib/projects/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/projects/service")>()),
  listAvatarOptions: vi.fn(async () => [
    {
      id: "av1",
      name: "Neil",
      previewUrl: null,
      usable: true,
      isPublic: false,
      avatarType: null,
      looks: [
        { id: "lk1", name: "Studio", ready: true, previewUrl: null, videoUrl: null, defaultVoiceId: "voice-neil", avatarType: "digital_twin", backgroundRemoval: support.value },
      ],
    },
  ]),
  listPublicAvatarOptions: vi.fn(async () => []),
}));

import { HeyGenApiError } from "@/lib/heygen";
import { generateProject } from "@/lib/projects/generate";
import { isBackgroundRemovalRejection } from "@/lib/backgrounds/media";

const photo = { id: "bg1", kind: "IMAGE", url: "https://x.public.blob.vercel-storage.com/backgrounds/u1/office.jpg" };
const clip = { id: "bg2", kind: "VIDEO", url: "https://x.public.blob.vercel-storage.com/backgrounds/u1/sea.mp4" };

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
    backgroundAdjust: null,
    ...over,
  };
}

function project(scenes: ReturnType<typeof scene>[]) {
  return {
    id: "p1", userId: "u1", title: "Office", status: "DRAFT", aspectRatio: "16:9", resolution: null, engine: "AVATAR_III",
    captionsEnabled: false, watermarkUrl: null, watermarkPosition: "BOTTOM_RIGHT",
    defaultAvatarId: null, defaultAvatarLookId: null, defaultVoiceId: null, defaultVoiceName: null, scenes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  support.value = "SUPPORTED";
  db.videoProject.updateMany.mockResolvedValue({ count: 1 });
  db.avatar.findMany.mockResolvedValue([
    { id: "av1", name: "Neil", heygenAvatarId: "hg-avatar", isPublic: false, looks: [{ id: "lk1", heygenLookId: "hg-look-1", status: "ready" }] },
  ]);
  db.generatedVideo.create.mockResolvedValue({ id: "vid1" });
  db.avatarLook.update.mockResolvedValue({});
  ledger.reserveCreditsForGeneration.mockResolvedValue({ ok: true, ledgerEntryId: "le1" });
  heygen.createHeyGenStudioVideo.mockResolvedValue({ video_id: "hg-video" });
});

describe("generateProject with custom avatar backgrounds", () => {
  it("sends the photo or video behind the avatar and records it in the snapshot", async () => {
    db.videoProject.findFirst.mockResolvedValue(
      project([scene(0, { backgroundMediaId: "bg1", backgroundMedia: photo }), scene(1, { backgroundMediaId: "bg2", backgroundMedia: clip }), scene(2)]),
    );

    expect(await generateProject("u1", "p1", 1)).toEqual({ ok: true, generatedVideoId: "vid1" });

    const { scenes } = heygen.createHeyGenStudioVideo.mock.calls[0][0];
    expect(scenes[0].background).toEqual({ kind: "image", url: photo.url });
    expect(scenes[1].background).toEqual({ kind: "video", url: clip.url });
    expect("background" in scenes[2]).toBe(false);

    const snapshot = db.generatedVideo.create.mock.calls[0][0].data.sceneSnapshot;
    expect(snapshot[0]).toMatchObject({ backgroundUrl: photo.url, backgroundKind: "IMAGE" });
    expect(snapshot[1]).toMatchObject({ backgroundUrl: clip.url, backgroundKind: "VIDEO" });
    expect("backgroundUrl" in snapshot[2]).toBe(false);
  });

  it("sends the adjusted copy of a photo when the scene has adjustments", async () => {
    const adjust = { darken: 30, warmth: 20, saturation: 90, blur: 2 };
    db.videoProject.findFirst.mockResolvedValue(project([scene(0, { backgroundMediaId: "bg1", backgroundMedia: photo, backgroundAdjust: adjust })]));
    expect(await generateProject("u1", "p1", 1)).toMatchObject({ ok: true });
    const sent = heygen.createHeyGenStudioVideo.mock.calls[0][0].scenes[0];
    expect(sent.background).toEqual({ kind: "image", url: "https://x.public.blob.vercel-storage.com/backgrounds/u1/adjusted-bg1.jpg" });
    expect(db.generatedVideo.create.mock.calls[0][0].data.sceneSnapshot[0].backgroundUrl).toBe(sent.background.url);
  });

  it("refuses before rendering when the look isn't marked as supporting backgrounds", async () => {
    support.value = "UNKNOWN";
    db.videoProject.findFirst.mockResolvedValue(project([scene(0, { backgroundMediaId: "bg1", backgroundMedia: photo })]));

    const result = await generateProject("u1", "p1", 1);

    expect(result).toMatchObject({ ok: false, code: "NOT_READY" });
    expect(result.ok === false && "issues" in result && result.issues.map((i) => i.code)).toContain("BACKGROUND_NOT_SUPPORTED");
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
  });

  it("when the provider rejects background removal: credits back, look marked unsupported, clear message", async () => {
    db.videoProject.findFirst.mockResolvedValue(project([scene(0, { backgroundMediaId: "bg1", backgroundMedia: photo })]));
    heygen.createHeyGenStudioVideo.mockRejectedValue(
      new HeyGenApiError("This video avatar does not support background removal. The avatar must have native alpha or be trained with matting enabled.", "invalid_parameter", 400),
    );

    const result = await generateProject("u1", "p1", 1);

    expect(result).toMatchObject({ ok: false, code: "HEYGEN_ERROR" });
    expect(result.ok === false && result.error).toMatch(/can't be shown on a custom background/);
    expect(ledger.releaseReservation).toHaveBeenCalledWith("le1");
    expect(db.avatarLook.update).toHaveBeenCalledWith({ where: { id: "lk1" }, data: { backgroundRemoval: "UNSUPPORTED" } });
  });

  it("recognises the provider's rejection text and nothing else", () => {
    expect(isBackgroundRemovalRejection("This video avatar does not support background removal.")).toBe(true);
    expect(isBackgroundRemovalRejection("The avatar must be trained with matting enabled.")).toBe(true);
    expect(isBackgroundRemovalRejection("Avatar not found")).toBe(false);
  });
});
