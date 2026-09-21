import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  videoProject: { findFirst: vi.fn(), updateMany: vi.fn() },
  avatar: { findMany: vi.fn() },
  generatedVideo: { create: vi.fn() },
  usageLedgerEntry: { update: vi.fn() },
}));
const heygen = vi.hoisted(() => ({
  createHeyGenStudioVideo: vi.fn(),
  getHeyGenAvatarLook: vi.fn(),
}));
const ledger = vi.hoisted(() => ({
  reserveCreditsForGeneration: vi.fn(),
  releaseReservation: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/heygen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/heygen")>();
  return { ...actual, ...heygen };
});
vi.mock("@/lib/usage/ledger", () => ledger);

import { HeyGenApiError } from "@/lib/heygen";
import { generateProject } from "@/lib/projects/generate";
import { ProjectError } from "@/lib/projects/service";

const avatarRow = {
  id: "a1",
  name: "Neil",
  status: "ready",
  heygenAvatarId: "h-avatar",
  looks: [{ id: "l1", name: "Suit", status: "ready", previewUrl: null, videoUrl: null, heygenLookId: "hl-1" }],
};

function project(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "u1",
    title: "Launch video",
    status: "DRAFT",
    aspectRatio: "16:9",
    resolution: null,
    engine: "AVATAR_III",
    defaultAvatarId: "a1",
    defaultAvatarLookId: "l1",
    defaultVoiceId: null,
    defaultVoiceName: null,
    version: 3,
    scenes: [
      { id: "s1", orderIndex: 0, title: "Intro", script: "Welcome to the launch", avatarId: null, avatarLookId: null, voiceId: null, voiceName: null, backgroundColor: null },
      { id: "s2", orderIndex: 1, title: "", script: "Here is what is new", avatarId: null, avatarLookId: null, voiceId: "v-own", voiceName: "Liam", backgroundColor: "#112233" },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.videoProject.findFirst.mockResolvedValue(project());
  prismaMock.videoProject.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.avatar.findMany.mockResolvedValue([avatarRow]);
  prismaMock.generatedVideo.create.mockResolvedValue({ id: "gv1" });
  heygen.getHeyGenAvatarLook.mockResolvedValue({ default_voice_id: "v-default" });
  heygen.createHeyGenStudioVideo.mockResolvedValue({ video_id: "provider-1" });
  ledger.reserveCreditsForGeneration.mockResolvedValue({ ok: true, ledgerEntryId: "led1" });
});

describe("generateProject", () => {
  it("sends every scene in order as one provider job and reserves credits once", async () => {
    const result = await generateProject("u1", "p1", 3);
    expect(result).toEqual({ ok: true, generatedVideoId: "gv1" });

    expect(heygen.createHeyGenStudioVideo).toHaveBeenCalledOnce();
    const call = heygen.createHeyGenStudioVideo.mock.calls[0][0];
    expect(call.scenes).toEqual([
      { avatarId: "hl-1", script: "Welcome to the launch", voiceId: "v-default", backgroundColor: null },
      { avatarId: "hl-1", script: "Here is what is new", voiceId: "v-own", backgroundColor: "#112233" },
    ]);
    expect(call).toMatchObject({ engine: "avatar_iii", aspectRatio: "16:9", title: "Launch video" });

    expect(ledger.reserveCreditsForGeneration).toHaveBeenCalledOnce();
    expect(ledger.reserveCreditsForGeneration.mock.calls[0][0].script).toBe("Welcome to the launch\nHere is what is new");

    const created = prismaMock.generatedVideo.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ projectId: "p1", status: "PROCESSING", heygenVideoId: "provider-1", avatarId: "a1" });
    expect(created.sceneSnapshot).toHaveLength(2);
    expect(prismaMock.usageLedgerEntry.update).toHaveBeenCalledWith({ where: { id: "led1" }, data: { videoId: "gv1" } });
  });

  it("claims the project with a conditional update, so a second click cannot start another render", async () => {
    await generateProject("u1", "p1", 3);
    expect(prismaMock.videoProject.updateMany.mock.calls[0][0].where).toEqual({
      id: "p1",
      userId: "u1",
      version: 3,
      status: { not: "GENERATING" },
    });
  });

  it("does nothing when the project is already generating", async () => {
    prismaMock.videoProject.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.videoProject.findFirst.mockResolvedValueOnce(project()).mockResolvedValueOnce({ status: "GENERATING" });
    await expect(generateProject("u1", "p1", 3)).rejects.toMatchObject({ code: "GENERATING" });
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
  });

  it("reports a version conflict when the project changed elsewhere", async () => {
    prismaMock.videoProject.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.videoProject.findFirst.mockResolvedValueOnce(project()).mockResolvedValueOnce({ status: "DRAFT" });
    await expect(generateProject("u1", "p1", 2)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
  });

  it("refuses an incomplete project without claiming it or spending credits", async () => {
    prismaMock.videoProject.findFirst.mockResolvedValue(
      project({ scenes: [{ id: "s1", orderIndex: 0, title: "", script: "", avatarId: null, avatarLookId: null, voiceId: null, voiceName: null, backgroundColor: null }] }),
    );
    const result = await generateProject("u1", "p1", 3);
    expect(result).toMatchObject({ ok: false, code: "NOT_READY" });
    expect(prismaMock.videoProject.updateMany).not.toHaveBeenCalled();
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
  });

  it("gives the project back its previous status when credits run out", async () => {
    ledger.reserveCreditsForGeneration.mockResolvedValue({
      ok: false,
      code: "OVER_LIMIT",
      creditsUsedMilli: 10,
      creditsLimitMilli: 10,
      periodEnd: new Date("2026-10-01T00:00:00Z"),
    });
    const result = await generateProject("u1", "p1", 3);
    expect(result).toMatchObject({ ok: false, code: "OVER_LIMIT", creditsLimitMilli: 10 });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();
    expect(prismaMock.videoProject.updateMany.mock.calls.at(-1)?.[0].data).toEqual({ status: "DRAFT" });
  });

  it("releases the reservation and records a failed render when the provider rejects the job", async () => {
    heygen.createHeyGenStudioVideo.mockRejectedValue(new HeyGenApiError("Avatar not found", "invalid_parameter", 400));
    const result = await generateProject("u1", "p1", 3);
    expect(result).toMatchObject({ ok: false, code: "HEYGEN_ERROR", error: "Avatar not found" });
    expect(ledger.releaseReservation).toHaveBeenCalledWith("led1");
    expect(prismaMock.generatedVideo.create.mock.calls[0][0].data).toMatchObject({ status: "FAILED", projectId: "p1" });
    expect(prismaMock.videoProject.updateMany.mock.calls.at(-1)?.[0].data).toEqual({ status: "FAILED" });
  });

  it("fails clearly, and undoes the claim, when a scene has no voice", async () => {
    heygen.getHeyGenAvatarLook.mockResolvedValue({ default_voice_id: null });
    const result = await generateProject("u1", "p1", 3);
    expect(result).toMatchObject({ ok: false, code: "NO_VOICE" });
    expect(result.ok === false && result.error).toContain("Scene 1");
    expect(ledger.reserveCreditsForGeneration).not.toHaveBeenCalled();
  });

  it("cannot generate a project the user does not own", async () => {
    prismaMock.videoProject.findFirst.mockResolvedValue(null);
    await expect(generateProject("intruder", "p1", 3)).rejects.toBeInstanceOf(ProjectError);
    expect(prismaMock.videoProject.findFirst.mock.calls[0][0].where).toMatchObject({ id: "p1", userId: "intruder" });
  });
});
