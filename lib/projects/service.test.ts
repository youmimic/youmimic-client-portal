import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is exercised against a fake Prisma client so the ownership,
// version-conflict and limit rules can be checked without a database.

const tx = {
  videoProject: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  videoScene: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  avatar: { findFirst: vi.fn() },
  avatarLook: { findFirst: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    videoProject: { deleteMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  addScene,
  deleteProject,
  deleteScene,
  deleteScenes,
  duplicateScene,
  importScenesFromDocument,
  ProjectError,
  reorderScenes,
  updateScene,
} from "@/lib/projects/service";
import { SCENE_SCRIPT_MAX } from "@/lib/projects/rules";

async function code(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (e) {
    return e instanceof ProjectError ? e.code : `other:${String(e)}`;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the version check passes.
  tx.videoProject.updateMany.mockResolvedValue({ count: 1 });
});

describe("ownership", () => {
  it("scopes every project write to the signed-in user", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "s1" }]);
    tx.videoScene.create.mockResolvedValue({ id: "s2" });
    await addScene("user-1", "p1", 3);
    expect(tx.videoProject.updateMany.mock.calls[0][0].where).toMatchObject({ id: "p1", userId: "user-1", version: 3 });
  });

  it("cannot edit a scene that isn't in one of the user's projects", async () => {
    tx.videoScene.findFirst.mockResolvedValue(null);
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, script: "x" }))).toBe("NOT_FOUND");
    expect(tx.videoScene.findFirst.mock.calls[0][0].where).toMatchObject({ id: "s1", projectId: "p1", project: { userId: "user-1" } });
    expect(tx.videoScene.update).not.toHaveBeenCalled();
  });

  it("cannot point a scene at someone else's avatar", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    tx.avatar.findFirst.mockResolvedValue(null);
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, avatarId: "not-mine" }))).toBe("BAD_AVATAR");
    expect(tx.avatar.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "not-mine",
      OR: [{ userId: "user-1" }, { isPublic: true }],
    });
    expect(tx.videoScene.update).not.toHaveBeenCalled();
  });

  it("allows pointing a scene at a public avatar the user doesn't own", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    tx.avatar.findFirst.mockResolvedValue({ id: "public-avatar" });
    tx.videoScene.update.mockResolvedValue({ id: "s1" });
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, avatarId: "public-avatar" }))).toBeNull();
    expect(tx.videoScene.update).toHaveBeenCalled();
  });

  it("cannot use a look from a different avatar", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: "a1" });
    tx.avatar.findFirst.mockResolvedValue({ id: "a1" });
    tx.avatarLook.findFirst.mockResolvedValue(null);
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, avatarId: "a1", avatarLookId: "other-look" }))).toBe("BAD_AVATAR");
  });

  it("only deletes a project the user owns", async () => {
    (prisma.videoProject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    (prisma.videoProject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await code(deleteProject("user-1", "someone-elses"))).toBe("NOT_FOUND");
    expect((prisma.videoProject.deleteMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toMatchObject({ id: "someone-elses", userId: "user-1" });
  });

  it("won't delete a project while it is generating", async () => {
    (prisma.videoProject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    (prisma.videoProject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "GENERATING" });
    expect(await code(deleteProject("user-1", "p1"))).toBe("GENERATING");
    expect((prisma.videoProject.deleteMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toMatchObject({ status: { not: "GENERATING" } });
  });

  it("deletes a draft the user owns", async () => {
    (prisma.videoProject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    expect(await code(deleteProject("user-1", "p1"))).toBeNull();
  });
});

describe("version conflicts and locking", () => {
  it("rejects an edit made against an out-of-date version", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    tx.videoProject.updateMany.mockResolvedValue({ count: 0 });
    tx.videoProject.findFirst.mockResolvedValue({ status: "DRAFT" });
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, script: "x" }))).toBe("VERSION_CONFLICT");
    expect(tx.videoScene.update).not.toHaveBeenCalled();
  });

  it("refuses edits while the video is generating", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    tx.videoProject.updateMany.mockResolvedValue({ count: 0 });
    tx.videoProject.findFirst.mockResolvedValue({ status: "GENERATING" });
    expect(await code(updateScene("user-1", "p1", "s1", { expectedVersion: 1, script: "x" }))).toBe("GENERATING");
  });

  it("returns the next version after a successful edit", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    const result = await updateScene("user-1", "p1", "s1", { expectedVersion: 4, script: "hello" });
    expect(result.version).toBe(5);
    expect(tx.videoScene.update).toHaveBeenCalledOnce();
  });

  it("resets the look when a scene's avatar changes without a look", async () => {
    tx.videoScene.findFirst.mockResolvedValue({ id: "s1", avatarId: null });
    tx.avatar.findFirst.mockResolvedValue({ id: "a1" });
    await updateScene("user-1", "p1", "s1", { expectedVersion: 1, avatarId: "a1" });
    expect(tx.videoScene.update.mock.calls[0][0].data).toMatchObject({ avatarId: "a1", avatarLookId: null });
  });
});

describe("scene rules", () => {
  it("won't delete the last scene", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "only" }]);
    expect(await code(deleteScene("user-1", "p1", "only", 1))).toBe("LAST_SCENE");
    expect(tx.videoScene.delete).not.toHaveBeenCalled();
  });

  it("renumbers the remaining scenes after a delete", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await deleteScene("user-1", "p1", "b", 1);
    expect(tx.videoScene.delete).toHaveBeenCalledWith({ where: { id: "b" } });
    const updates = tx.videoScene.update.mock.calls.map((c) => [c[0].where.id, c[0].data.orderIndex]);
    expect(updates).toEqual([["a", 0], ["c", 1]]);
  });

  it("[deleteScenes] deletes the selected scenes and renumbers the rest", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
    const result = await deleteScenes("user-1", "p1", ["b", "d"], 3);
    expect(result).toEqual({ version: 4, deleted: 2 });
    expect(tx.videoScene.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", id: { in: ["b", "d"] } } });
    const updates = tx.videoScene.update.mock.calls.map((c) => [c[0].where.id, c[0].data.orderIndex]);
    expect(updates).toEqual([["a", 0], ["c", 1]]);
  });

  it("[deleteScenes] won't delete every scene", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await code(deleteScenes("user-1", "p1", ["a", "b"], 1))).toBe("LAST_SCENE");
    expect(tx.videoScene.deleteMany).not.toHaveBeenCalled();
  });

  it("[deleteScenes] refuses if any id isn't in this project, deleting nothing", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await code(deleteScenes("user-1", "p1", ["a", "someone-elses"], 1))).toBe("NOT_FOUND");
    expect(tx.videoScene.deleteMany).not.toHaveBeenCalled();
  });

  it("[deleteScenes] rejects a stale version before touching anything", async () => {
    tx.videoProject.updateMany.mockResolvedValue({ count: 0 });
    tx.videoProject.findFirst.mockResolvedValue({ status: "DRAFT" });
    expect(await code(deleteScenes("user-1", "p1", ["a"], 1))).toBe("VERSION_CONFLICT");
    expect(tx.videoScene.deleteMany).not.toHaveBeenCalled();
  });

  it("stops at the scene limit", async () => {
    tx.videoScene.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })));
    expect(await code(addScene("user-1", "p1", 1))).toBe("LIMIT");
    expect(tx.videoScene.create).not.toHaveBeenCalled();
  });

  it("starts a new scene with the avatar, look, voice and kind of the scene it follows", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", kind: "IMAGE", avatarId: "av1", avatarLookId: "lk1", voiceId: "v1", voiceName: "Emma" },
      { id: "b", kind: "AVATAR", avatarId: "av2", avatarLookId: "lk2", voiceId: null, voiceName: null },
    ]);
    tx.videoScene.create.mockResolvedValue({ id: "new" });
    await addScene("user-1", "p1", 1, "a");
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      kind: "IMAGE",
      avatarId: "av1",
      avatarLookId: "lk1",
      voiceId: "v1",
      voiceName: "Emma",
    });
    // Content fields are never carried over, only structure.
    expect(tx.videoScene.create.mock.calls[0][0].data.mediaUrl).toBeUndefined();
  });

  it("falls back to the last scene when no anchor is given", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", avatarId: "av1", avatarLookId: "lk1", voiceId: null, voiceName: null },
      { id: "b", avatarId: "av2", avatarLookId: "lk2", voiceId: null, voiceName: null },
    ]);
    tx.videoScene.create.mockResolvedValue({ id: "new" });
    await addScene("user-1", "p1", 1);
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({ avatarId: "av2", avatarLookId: "lk2" });
  });

  it("inserts a new scene straight after the chosen one", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    tx.videoScene.create.mockResolvedValue({ id: "new" });
    await addScene("user-1", "p1", 1, "a");
    const order = tx.videoScene.update.mock.calls.map((c) => c[0].where.id);
    expect(order).toEqual(["a", "new", "b", "c"]);
  });

  it("[importScenesFromDocument] creates one AVATAR scene per page, inheriting the last scene's avatar/look/voice", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", avatarId: "av1", avatarLookId: "lk1", voiceId: "v1", voiceName: "Emma" },
    ]);
    tx.videoScene.create
      .mockResolvedValueOnce({ id: "p1-scene" })
      .mockResolvedValueOnce({ id: "p2-scene" });

    const result = await importScenesFromDocument("user-1", "p1", 1, ["Page one text", "Page two text"]);

    expect(result).toEqual({ version: 2, firstSceneId: "p1-scene", scenesAdded: 2, pagesSkipped: 0 });
    expect(tx.videoScene.create).toHaveBeenCalledTimes(2);
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      kind: "AVATAR",
      title: "Page 1",
      script: "Page one text",
      avatarId: "av1",
      avatarLookId: "lk1",
      voiceId: "v1",
      voiceName: "Emma",
      orderIndex: 1,
    });
    expect(tx.videoScene.create.mock.calls[1][0].data).toMatchObject({ title: "Page 2", script: "Page two text", orderIndex: 2 });
  });

  it("[importScenesFromDocument] skips blank pages and reports how many were skipped", async () => {
    tx.videoScene.findMany.mockResolvedValue([]);
    tx.videoScene.create.mockResolvedValueOnce({ id: "only-scene" });

    const result = await importScenesFromDocument("user-1", "p1", 1, ["  ", "Real content", "\n\n"]);

    expect(result).toEqual({ version: 2, firstSceneId: "only-scene", scenesAdded: 1, pagesSkipped: 2 });
    expect(tx.videoScene.create).toHaveBeenCalledOnce();
  });

  it("[importScenesFromDocument] fails with BAD_FILE when no page has readable text", async () => {
    tx.videoScene.findMany.mockResolvedValue([]);
    expect(await code(importScenesFromDocument("user-1", "p1", 1, ["", "   "]))).toBe("BAD_FILE");
    expect(tx.videoScene.create).not.toHaveBeenCalled();
  });

  it("[importScenesFromDocument] stops at the scene limit, counting existing scenes against it", async () => {
    tx.videoScene.findMany.mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({ id: `s${i}` })));
    expect(await code(importScenesFromDocument("user-1", "p1", 1, ["one", "two"]))).toBe("LIMIT");
    expect(tx.videoScene.create).not.toHaveBeenCalled();
  });

  it("[importScenesFromDocument] truncates an overly long page to the scene script cap", async () => {
    tx.videoScene.findMany.mockResolvedValue([]);
    tx.videoScene.create.mockResolvedValueOnce({ id: "s1" });
    const longText = "x".repeat(SCENE_SCRIPT_MAX * 3);
    await importScenesFromDocument("user-1", "p1", 1, [longText]);
    expect(tx.videoScene.create.mock.calls[0][0].data.script).toHaveLength(SCENE_SCRIPT_MAX * 2);
  });

  it("[importScenesFromDocument] replaceExisting deletes every existing scene first and starts fresh, with no avatar to inherit", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", avatarId: "av1", avatarLookId: "lk1", voiceId: "v1", voiceName: "Emma" },
    ]);
    tx.videoScene.create.mockResolvedValueOnce({ id: "new-scene" });

    const result = await importScenesFromDocument("user-1", "p1", 1, ["Fresh content"], "Page", true);

    expect(tx.videoScene.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      orderIndex: 0,
      avatarId: null,
      avatarLookId: null,
      voiceId: null,
      voiceName: null,
    });
    expect(result).toEqual({ version: 2, firstSceneId: "new-scene", scenesAdded: 1, pagesSkipped: 0 });
  });

  it("[importScenesFromDocument] replaceExisting doesn't count the (about to be deleted) existing scenes against the limit", async () => {
    tx.videoScene.findMany.mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({ id: `s${i}` })));
    tx.videoScene.create.mockResolvedValueOnce({ id: "s1" });
    const result = await importScenesFromDocument("user-1", "p1", 1, ["one"], "Page", true);
    expect(result.scenesAdded).toBe(1);
    expect(tx.videoScene.deleteMany).toHaveBeenCalled();
  });

  it("[importScenesFromDocument] replaceExisting skips the delete call when there was nothing to delete", async () => {
    tx.videoScene.findMany.mockResolvedValue([]);
    tx.videoScene.create.mockResolvedValueOnce({ id: "s1" });
    await importScenesFromDocument("user-1", "p1", 1, ["one"], "Page", true);
    expect(tx.videoScene.deleteMany).not.toHaveBeenCalled();
  });

  it("copies every setting when duplicating and places the copy next to the original", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      {
        id: "a",
        title: "Intro",
        script: "Hi",
        kind: "IMAGE",
        avatarId: "av",
        avatarLookId: "lk",
        voiceId: "v",
        voiceName: "Emma",
        backgroundColor: "#111111",
        mediaUrl: "https://example.com/a.png",
        mediaDurationSeconds: 6,
        motionPrompt: "smiles",
      },
      { id: "b", title: "", script: "", kind: "AVATAR", avatarId: null, avatarLookId: null, voiceId: null, voiceName: null, backgroundColor: null, mediaUrl: null, mediaDurationSeconds: null, motionPrompt: null },
    ]);
    tx.videoScene.create.mockResolvedValue({ id: "copy" });
    await duplicateScene("user-1", "p1", "a", 2);
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      title: "Intro (copy)",
      script: "Hi",
      kind: "IMAGE",
      avatarId: "av",
      avatarLookId: "lk",
      voiceId: "v",
      voiceName: "Emma",
      backgroundColor: "#111111",
      mediaUrl: "https://example.com/a.png",
      mediaDurationSeconds: 6,
      motionPrompt: "smiles",
    });
    expect(tx.videoScene.update.mock.calls.map((c) => c[0].where.id)).toEqual(["a", "copy", "b"]);
  });

  it("rejects a reorder that isn't a permutation of the project's scenes", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await code(reorderScenes("user-1", "p1", ["a", "x"], 1))).toBe("BAD_REORDER");
    expect(await code(reorderScenes("user-1", "p1", ["a"], 1))).toBe("BAD_REORDER");
    expect(tx.videoScene.update).not.toHaveBeenCalled();
  });

  it("applies a valid reorder", async () => {
    tx.videoScene.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await reorderScenes("user-1", "p1", ["c", "a", "b"], 1);
    const updates = tx.videoScene.update.mock.calls.map((c) => [c[0].where.id, c[0].data.orderIndex]);
    expect(updates).toEqual([["c", 0], ["a", 1], ["b", 2]]);
  });
});
