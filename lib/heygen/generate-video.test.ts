import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAvatarVideo, sweepStuckGenerations } from "@/lib/heygen/generate-video";

const findManyGeneratedVideo = vi.fn();
const updateGeneratedVideo = vi.fn();
const createGeneratedVideo = vi.fn();
const findFirstAvatar = vi.fn();
const updateUsageLedgerEntry = vi.fn();
const getHeyGenVideoStatus = vi.fn();
const getHeyGenAvatarLook = vi.fn();
const createHeyGenVideo = vi.fn();
const createHeyGenStudioVideo = vi.fn();
const findFirstBackgroundMedia = vi.fn();
const updateAvatarLook = vi.fn();
const reconcileCredits = vi.fn();
const releaseReservationForVideo = vi.fn();
const reserveCreditsForGeneration = vi.fn();
const releaseReservation = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    generatedVideo: {
      findMany: (...args: unknown[]) => findManyGeneratedVideo(...args),
      update: (...args: unknown[]) => updateGeneratedVideo(...args),
      create: (...args: unknown[]) => createGeneratedVideo(...args),
    },
    avatar: {
      findFirst: (...args: unknown[]) => findFirstAvatar(...args),
    },
    backgroundMedia: {
      findFirst: (...args: unknown[]) => findFirstBackgroundMedia(...args),
    },
    avatarLook: {
      update: (...args: unknown[]) => updateAvatarLook(...args),
    },
    usageLedgerEntry: {
      update: (...args: unknown[]) => updateUsageLedgerEntry(...args),
    },
  },
}));

vi.mock("@/lib/heygen", () => ({
  getHeyGenVideoStatus: (...args: unknown[]) => getHeyGenVideoStatus(...args),
  getHeyGenAvatarLook: (...args: unknown[]) => getHeyGenAvatarLook(...args),
  createHeyGenVideo: (...args: unknown[]) => createHeyGenVideo(...args),
  createHeyGenStudioVideo: (...args: unknown[]) => createHeyGenStudioVideo(...args),
  HeyGenApiError: class HeyGenApiError extends Error {},
  PUBLIC_AVATAR_VOICE_LOCALE: "en-AU",
}));

vi.mock("@/lib/heygen/pricing", () => ({
  estimatedCostCents: vi.fn(() => 100),
}));

vi.mock("@/lib/usage/ledger", () => ({
  reserveCreditsForGeneration: (...args: unknown[]) => reserveCreditsForGeneration(...args),
  releaseReservation: (...args: unknown[]) => releaseReservation(...args),
  reconcileCredits: (...args: unknown[]) => reconcileCredits(...args),
  releaseReservationForVideo: (...args: unknown[]) => releaseReservationForVideo(...args),
}));

const STUCK_ROW = {
  id: "video_1",
  heygenVideoId: "heygen_video_1",
  engine: "AVATAR_III",
  resolution: null,
};

beforeEach(() => {
  findManyGeneratedVideo.mockReset();
  updateGeneratedVideo.mockReset();
  createGeneratedVideo.mockReset();
  findFirstAvatar.mockReset();
  updateUsageLedgerEntry.mockReset();
  getHeyGenVideoStatus.mockReset();
  getHeyGenAvatarLook.mockReset();
  createHeyGenVideo.mockReset();
  createHeyGenStudioVideo.mockReset();
  findFirstBackgroundMedia.mockReset();
  updateAvatarLook.mockReset();
  reconcileCredits.mockReset();
  releaseReservationForVideo.mockReset();
  reserveCreditsForGeneration.mockReset();
  releaseReservation.mockReset();
});

describe("sweepStuckGenerations", () => {
  it("queries only PENDING/PROCESSING rows with a heygenVideoId older than the stuck threshold", async () => {
    findManyGeneratedVideo.mockResolvedValue([]);

    await sweepStuckGenerations();

    const where = findManyGeneratedVideo.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["PENDING", "PROCESSING"] });
    expect(where.heygenVideoId).toEqual({ not: null });
    expect(where.createdAt.lte).toBeInstanceOf(Date);
    // Threshold should be in the past, roughly 30 minutes ago.
    const ageMs = Date.now() - where.createdAt.lte.getTime();
    expect(ageMs).toBeGreaterThan(29 * 60 * 1000);
    expect(ageMs).toBeLessThan(31 * 60 * 1000);
  });

  it("marks a row COMPLETED and reconciles credits when HeyGen reports it finished", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({ status: "completed", duration: 5.2, video_url: "https://x/video.mp4" });
    updateGeneratedVideo.mockResolvedValue({ status: "COMPLETED", videoUrl: "https://x/video.mp4" });
    reconcileCredits.mockResolvedValue(undefined);

    const result = await sweepStuckGenerations();

    expect(result).toEqual({ checked: 1, resolved: 1, stillProcessing: 0, failed: [] });
    expect(updateGeneratedVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "video_1" },
        data: expect.objectContaining({ status: "COMPLETED", durationSeconds: 5.2 }),
      }),
    );
    expect(reconcileCredits).toHaveBeenCalledWith({ videoId: "video_1", engine: "AVATAR_III", actualDurationSeconds: 5.2 });
  });

  it("stores both the plain and captioned renders when captions were requested, letting the viewer choose", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({
      status: "completed",
      duration: 5.2,
      video_url: "https://x/plain.mp4",
      captioned_video_url: "https://x/captioned.mp4",
    });
    updateGeneratedVideo.mockResolvedValue({ status: "COMPLETED", videoUrl: "https://x/plain.mp4" });
    reconcileCredits.mockResolvedValue(undefined);

    await sweepStuckGenerations();

    expect(updateGeneratedVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ videoUrl: "https://x/plain.mp4", captionedVideoUrl: "https://x/captioned.mp4" }),
      }),
    );
  });

  it("leaves captionedVideoUrl unset when no captions were requested", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({ status: "completed", duration: 5.2, video_url: "https://x/plain.mp4" });
    updateGeneratedVideo.mockResolvedValue({ status: "COMPLETED", videoUrl: "https://x/plain.mp4" });
    reconcileCredits.mockResolvedValue(undefined);

    await sweepStuckGenerations();

    expect(updateGeneratedVideo).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ videoUrl: "https://x/plain.mp4", captionedVideoUrl: undefined }) }),
    );
  });

  it("uses HeyGen's own completed_at timestamp, not the moment the sweep happens to run", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    // A video that actually finished 25 minutes ago, found by a sweep
    // running right now — completedAt must reflect the real finish time,
    // not "now", otherwise a late reconciliation shows the wrong duration.
    const realCompletionUnixSeconds = Math.floor(Date.now() / 1000) - 25 * 60;
    getHeyGenVideoStatus.mockResolvedValue({
      status: "completed",
      duration: 5.2,
      video_url: "https://x/video.mp4",
      completed_at: realCompletionUnixSeconds,
    });
    updateGeneratedVideo.mockResolvedValue({ status: "COMPLETED", videoUrl: "https://x/video.mp4" });
    reconcileCredits.mockResolvedValue(undefined);

    await sweepStuckGenerations();

    const data = updateGeneratedVideo.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.completedAt.getTime()).toBe(realCompletionUnixSeconds * 1000);
  });

  it("falls back to the current time for completedAt when HeyGen doesn't provide completed_at", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({ status: "completed", duration: 5.2, video_url: "https://x/video.mp4" });
    updateGeneratedVideo.mockResolvedValue({ status: "COMPLETED", videoUrl: "https://x/video.mp4" });
    reconcileCredits.mockResolvedValue(undefined);

    const before = Date.now();
    await sweepStuckGenerations();
    const after = Date.now();

    const data = updateGeneratedVideo.mock.calls[0][0].data;
    expect(data.completedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.completedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("marks a row FAILED and releases the credit reservation when HeyGen reports it failed", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({ status: "failed", error: { message: "Render error" } });
    updateGeneratedVideo.mockResolvedValue({ status: "FAILED", videoUrl: null });
    releaseReservationForVideo.mockResolvedValue(undefined);

    const result = await sweepStuckGenerations();

    expect(result).toEqual({ checked: 1, resolved: 1, stillProcessing: 0, failed: [] });
    expect(releaseReservationForVideo).toHaveBeenCalledWith("video_1");
  });

  it("leaves a row alone (stillProcessing) when HeyGen reports it's genuinely still rendering", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW]);
    getHeyGenVideoStatus.mockResolvedValue({ status: "processing" });
    updateGeneratedVideo.mockResolvedValue({ status: "PROCESSING", videoUrl: null });

    const result = await sweepStuckGenerations();

    expect(result).toEqual({ checked: 1, resolved: 0, stillProcessing: 1, failed: [] });
    expect(reconcileCredits).not.toHaveBeenCalled();
    expect(releaseReservationForVideo).not.toHaveBeenCalled();
  });

  it("records a per-row failure and keeps processing the rest when a HeyGen lookup throws", async () => {
    findManyGeneratedVideo.mockResolvedValue([STUCK_ROW, { ...STUCK_ROW, id: "video_2", heygenVideoId: "heygen_video_2" }]);
    getHeyGenVideoStatus.mockRejectedValueOnce(new Error("HeyGen down")).mockResolvedValueOnce({ status: "processing" });
    updateGeneratedVideo.mockResolvedValue({ status: "PROCESSING", videoUrl: null });

    const result = await sweepStuckGenerations();

    expect(result.checked).toBe(2);
    expect(result.failed).toEqual([{ generatedVideoId: "video_1", error: "Unknown error" }]);
    expect(result.stillProcessing).toBe(1);
  });
});

describe("generateAvatarVideo", () => {
  const PUBLIC_AVATAR = {
    id: "public-avatar",
    heygenAvatarId: "heygen-public-avatar",
    status: "ready",
    isPublic: true,
    looks: [],
  };

  beforeEach(() => {
    findFirstAvatar.mockResolvedValue(PUBLIC_AVATAR);
    getHeyGenAvatarLook.mockResolvedValue({ default_voice_id: "voice-1" });
    reserveCreditsForGeneration.mockResolvedValue({ ok: true, ledgerEntryId: "ledger-1" });
    createGeneratedVideo.mockResolvedValue({ id: "gv-1" });
    updateUsageLedgerEntry.mockResolvedValue(undefined);
    createHeyGenVideo.mockResolvedValue({ video_id: "provider-1" });
    updateGeneratedVideo.mockResolvedValue({ id: "gv-1" });
  });

  it("looks up the avatar as owned-by-this-user OR public, not owned-only", async () => {
    await generateAvatarVideo("non-owner", "public-avatar", "A script");

    expect(findFirstAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "public-avatar", OR: [{ userId: "non-owner" }, { isPublic: true }] },
      }),
    );
  });

  it("succeeds generating with a public avatar the caller doesn't own, charged to the caller's own credits", async () => {
    const result = await generateAvatarVideo("non-owner", "public-avatar", "A script");

    expect(result).toEqual({ ok: true, generatedVideoId: "gv-1" });
    // Credits are reserved against the generating user, never the avatar's owner.
    expect(reserveCreditsForGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "non-owner" }),
    );
    expect(createGeneratedVideo).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "non-owner", avatarId: "public-avatar" }) }),
    );
  });

  it("requests the en-AU locale for a public avatar, but not for an owned one", async () => {
    await generateAvatarVideo("non-owner", "public-avatar", "A script");
    expect(createHeyGenVideo).toHaveBeenCalledWith(expect.objectContaining({ voiceLocale: "en-AU" }));

    createHeyGenVideo.mockClear();
    findFirstAvatar.mockResolvedValue({ ...PUBLIC_AVATAR, isPublic: false });
    await generateAvatarVideo("owner", "owned-avatar", "A script");
    expect(createHeyGenVideo).toHaveBeenCalledWith(expect.objectContaining({ voiceLocale: undefined }));
  });

  it("still fails when the avatar is neither owned nor public", async () => {
    findFirstAvatar.mockResolvedValue(null);
    const result = await generateAvatarVideo("non-owner", "someone-elses-avatar", "A script");
    expect(result).toEqual({
      ok: false,
      code: "AVATAR_NOT_READY",
      error: "This avatar isn't ready to generate videos from yet.",
    });
    expect(reserveCreditsForGeneration).not.toHaveBeenCalled();
  });
});

describe("generateAvatarVideo with a custom background", () => {
  const OWNED = {
    id: "av-neil",
    heygenAvatarId: "hg-neil",
    status: "ready",
    isPublic: false,
    looks: [{ id: "look-l03", heygenLookId: "hg-look-l03", status: "ready", backgroundRemoval: "SUPPORTED" }],
  };
  const CLIP = { kind: "VIDEO", url: "https://x.public.blob.vercel-storage.com/backgrounds/u1/sea.mp4" };

  beforeEach(() => {
    findFirstAvatar.mockResolvedValue(OWNED);
    getHeyGenAvatarLook.mockResolvedValue({ default_voice_id: "voice-1" });
    reserveCreditsForGeneration.mockResolvedValue({ ok: true, ledgerEntryId: "ledger-1" });
    createGeneratedVideo.mockResolvedValue({ id: "gv-1" });
    createHeyGenStudioVideo.mockResolvedValue({ video_id: "provider-1" });
    updateGeneratedVideo.mockResolvedValue({ id: "gv-1" });
    findFirstBackgroundMedia.mockResolvedValue(CLIP);
    updateAvatarLook.mockResolvedValue({});
  });

  it("sends a one-scene studio job with the background and records its URL", async () => {
    const result = await generateAvatarVideo("u1", "av-neil", "Hello", "look-l03", "avatar_iii", { backgroundMediaId: "bg-1", aspectRatio: "16:9" });

    expect(result).toEqual({ ok: true, generatedVideoId: "gv-1" });
    expect(findFirstBackgroundMedia).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "bg-1", userId: "u1" } }));
    expect(createHeyGenVideo).not.toHaveBeenCalled();
    const call = createHeyGenStudioVideo.mock.calls[0][0];
    expect(call).toMatchObject({ engine: "avatar_iii", aspectRatio: "16:9" });
    expect(call.scenes).toEqual([
      { kind: "avatar", avatarId: "hg-look-l03", script: "Hello", voiceId: "voice-1", voiceLocale: undefined, background: { kind: "video", url: CLIP.url } },
    ]);
    expect(createGeneratedVideo).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ backgroundUrl: CLIP.url }) }));
  });

  it("keeps the original single-avatar request when no background is chosen", async () => {
    createHeyGenVideo.mockResolvedValue({ video_id: "provider-1" });
    await generateAvatarVideo("u1", "av-neil", "Hello", "look-l03");
    expect(createHeyGenStudioVideo).not.toHaveBeenCalled();
    expect(createHeyGenVideo).toHaveBeenCalledTimes(1);
  });

  it("refuses, before reserving credits, a look not marked as supporting backgrounds or a background that isn't yours", async () => {
    findFirstAvatar.mockResolvedValue({ ...OWNED, looks: [{ ...OWNED.looks[0], backgroundRemoval: "UNKNOWN" }] });
    expect(await generateAvatarVideo("u1", "av-neil", "Hello", "look-l03", "avatar_iii", { backgroundMediaId: "bg-1" })).toMatchObject({ ok: false, code: "BACKGROUND_NOT_SUPPORTED" });

    findFirstAvatar.mockResolvedValue(OWNED);
    findFirstBackgroundMedia.mockResolvedValue(null);
    expect(await generateAvatarVideo("u1", "av-neil", "Hello", "look-l03", "avatar_iii", { backgroundMediaId: "not-mine" })).toMatchObject({ ok: false, code: "BACKGROUND_NOT_SUPPORTED" });

    expect(reserveCreditsForGeneration).not.toHaveBeenCalled();
    expect(createHeyGenStudioVideo).not.toHaveBeenCalled();
  });

  it("when the provider rejects background removal: credits back and the look is marked unsupported", async () => {
    const { HeyGenApiError } = await import("@/lib/heygen");
    createHeyGenStudioVideo.mockRejectedValue(new HeyGenApiError("This video avatar does not support background removal."));
    const result = await generateAvatarVideo("u1", "av-neil", "Hello", "look-l03", "avatar_iii", { backgroundMediaId: "bg-1" });
    expect(result).toMatchObject({ ok: false, code: "BACKGROUND_NOT_SUPPORTED" });
    expect(releaseReservation).toHaveBeenCalledWith("ledger-1");
    expect(updateAvatarLook).toHaveBeenCalledWith({ where: { id: "look-l03" }, data: { backgroundRemoval: "UNSUPPORTED" } });
  });
});
