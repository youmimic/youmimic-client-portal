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
  duplicateScene,
  ProjectError,
  reorderScenes,
  updateScene,
} from "@/lib/projects/service";

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
    expect(tx.avatar.findFirst.mock.calls[0][0].where).toMatchObject({ id: "not-mine", userId: "user-1" });
    expect(tx.videoScene.update).not.toHaveBeenCalled();
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

  it("stops at the scene limit", async () => {
    tx.videoScene.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` })));
    expect(await code(addScene("user-1", "p1", 1))).toBe("LIMIT");
    expect(tx.videoScene.create).not.toHaveBeenCalled();
  });

  it("starts a new scene with the avatar, look and voice of the scene it follows", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", avatarId: "av1", avatarLookId: "lk1", voiceId: "v1", voiceName: "Emma" },
      { id: "b", avatarId: "av2", avatarLookId: "lk2", voiceId: null, voiceName: null },
    ]);
    tx.videoScene.create.mockResolvedValue({ id: "new" });
    await addScene("user-1", "p1", 1, "a");
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      avatarId: "av1",
      avatarLookId: "lk1",
      voiceId: "v1",
      voiceName: "Emma",
    });
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

  it("copies every setting when duplicating and places the copy next to the original", async () => {
    tx.videoScene.findMany.mockResolvedValue([
      { id: "a", title: "Intro", script: "Hi", avatarId: "av", avatarLookId: "lk", voiceId: "v", voiceName: "Emma", backgroundColor: "#111111" },
      { id: "b", title: "", script: "", avatarId: null, avatarLookId: null, voiceId: null, voiceName: null, backgroundColor: null },
    ]);
    tx.videoScene.create.mockResolvedValue({ id: "copy" });
    await duplicateScene("user-1", "p1", "a", 2);
    expect(tx.videoScene.create.mock.calls[0][0].data).toMatchObject({
      title: "Intro (copy)",
      script: "Hi",
      avatarId: "av",
      avatarLookId: "lk",
      voiceId: "v",
      voiceName: "Emma",
      backgroundColor: "#111111",
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
