import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real service code and real SQL against an ISOLATED local database (for
// example `npx prisma dev`, migrated with prisma.isolated.config.ts). Skipped
// unless ISOLATED_DATABASE_URL is set, and refuses any non-local host, so it
// can never touch the live database. The provider (HeyGen), the credit
// ledger and Blob storage are mocked: nothing here spends credits or
// uploads files.
//
//   ISOLATED_DATABASE_URL=postgres://postgres:postgres@localhost:51214/template1?sslmode=disable \
//     npm test -- lib/projects/isolated-db.integration.test.ts

const DB_URL = process.env.ISOLATED_DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const url = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(process.env.ISOLATED_DATABASE_URL ?? "")
    ? (process.env.ISOLATED_DATABASE_URL as string)
    : "postgres://nobody@localhost:1/none"; // never connected to when the suite is skipped
  return { default: new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) };
});

const heygen = vi.hoisted(() => ({
  // Unique per call: heygenVideoId is a unique column.
  createHeyGenStudioVideo: vi.fn<(params: { scenes: { kind: string }[] }) => Promise<{ video_id: string }>>(async () => ({ video_id: `hg-${Math.random().toString(36).slice(2)}` })),
  getHeyGenAvatarLook: vi.fn(async () => ({ default_voice_id: "voice-default" })),
}));
vi.mock("@/lib/heygen", async (orig) => ({ ...(await orig<typeof import("@/lib/heygen")>()), ...heygen }));
// Reserves without plan/billing lookups, but still writes a real ledger row,
// since generation links it to the video.
vi.mock("@/lib/usage/ledger", () => ({
  reserveCreditsForGeneration: vi.fn(async ({ userId, engine }: { userId: string; engine: "AVATAR_III" }) => {
    const { default: db } = await import("@/lib/prisma");
    const now = new Date();
    const entry = await db.usageLedgerEntry.create({
      data: { userId, engine, estimatedDurationSeconds: 5, creditsReservedMilli: 1, periodStart: now, periodEnd: now },
    });
    return { ok: true, ledgerEntryId: entry.id };
  }),
  releaseReservation: vi.fn(),
}));
const blob = vi.hoisted(() => ({ del: vi.fn(async () => {}), put: vi.fn(async (p: string) => ({ url: `https://blob.example/${p}` })) }));
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/slides/images", async (orig) => ({
  ...(await orig<typeof import("@/lib/slides/images")>()),
  slideRenditionUrl: vi.fn(async (_u: string, id: string, ratio: string) => `https://blob.example/slides/${id}-${ratio.replace(":", "x")}.jpg`),
}));

import prisma from "@/lib/prisma";
import {
  addScene,
  createProject,
  deleteProject,
  deleteScenes,
  duplicateScene,
  getProjectView,
  importScenesFromDocument,
  ProjectError,
  setScenesPresentation,
  updateProject,
  updateScene,
} from "@/lib/projects/service";
import { generateProject } from "@/lib/projects/generate";
import { removeUnusedBackgroundMedia } from "@/lib/backgrounds/media";
import { planImportedScenes } from "@/lib/projects/import-plan";
import {
  pruneUnusedSlideImages,
  removeSlideImagesAfterRender,
  SLIDE_IMAGE_GRACE_MS,
  SLIDE_RETENTION_AFTER_RENDER_MS,
} from "@/lib/slides/images";

const run = `t${Date.now()}`;
let userId = "";
let otherUserId = "";
let avatarId = "";
let lookId = "";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof ProjectError ? e.code : String(e);
  }
}

async function slideImage(owner: string, createdAt?: Date) {
  return prisma.slideImage.create({
    data: { userId: owner, url: `https://blob.example/slides/${owner}/${Math.random()}.jpg`, width: 1600, height: 1200, ...(createdAt ? { createdAt } : {}) },
  });
}

async function version(projectId: string) {
  return (await getProjectView(userId, projectId)).version;
}

describe.skipIf(!isLocal)("isolated database: slide scenes end to end", () => {
  beforeAll(async () => {
    const mk = (n: string) => prisma.user.create({ data: { name: n, email: `${n}-${run}@example.test`, passwordHash: "x" } });
    userId = (await mk("owner")).id;
    otherUserId = (await mk("other")).id;
    const avatar = await prisma.avatar.create({
      data: { userId, name: "Test Avatar", status: "ready", heygenAvatarId: `hg-av-${run}` },
    });
    avatarId = avatar.id;
    lookId = (await prisma.avatarLook.create({ data: { avatarId, heygenLookId: `hg-look-${run}`, name: "Suit", status: "ready" } })).id;
  });

  afterAll(async () => {
    // Avatars don't cascade from users (an existing rule), so they go first.
    await prisma.avatar.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("an existing-style Avatar project saves, reloads and generates exactly as before", async () => {
    const { id } = await createProject(userId, { title: "Avatar only" });
    const view = await getProjectView(userId, id);
    const scene = view.scenes[0];
    expect(scene.kind).toBe("AVATAR");
    expect(scene.slideImage).toBeNull();

    await updateScene(userId, id, scene.id, { expectedVersion: view.version, script: "Hello there.", avatarId, avatarLookId: lookId, voiceId: "v1", voiceName: "Emma" });
    const reloaded = await getProjectView(userId, id);
    expect(reloaded.scenes[0]).toMatchObject({ kind: "AVATAR", script: "Hello there.", avatarId, avatarLookId: lookId, voiceId: "v1" });

    heygen.createHeyGenStudioVideo.mockClear();
    const result = await generateProject(userId, id, reloaded.version);
    expect(result).toMatchObject({ ok: true });
    expect(heygen.createHeyGenStudioVideo.mock.calls[0][0].scenes.map((s: { kind: string }) => s.kind)).toEqual(["avatar"]);
    const video = await prisma.generatedVideo.findFirstOrThrow({ where: { projectId: id } });
    expect(video.avatarId).toBe(avatarId);
  });

  it("generation lock: a second generate and any edit are refused while the first is running", async () => {
    const { id } = await createProject(userId, { title: "Lock" });
    const v = await getProjectView(userId, id);
    await updateScene(userId, id, v.scenes[0].id, { expectedVersion: v.version, script: "Hi.", avatarId, avatarLookId: lookId, voiceId: "v1", voiceName: "Emma" });
    const ver = await version(id);
    expect(await generateProject(userId, id, ver)).toMatchObject({ ok: true });
    expect(await code(generateProject(userId, id, ver + 1))).toBe("GENERATING");
    expect(await code(updateScene(userId, id, v.scenes[0].id, { expectedVersion: ver + 1, script: "Changed" }))).toBe("GENERATING");
  });

  it("mixed project: switching modes keeps every selection, survives reload, and generates in order", async () => {
    const { id } = await createProject(userId, { title: "Mixed" });
    let view = await getProjectView(userId, id);
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version, script: "Intro.", avatarId, avatarLookId: lookId, voiceId: "v1", voiceName: "Emma" });
    await addScene(userId, id, await version(id));
    await addScene(userId, id, await version(id));
    view = await getProjectView(userId, id);
    const [, middle, last] = view.scenes;
    const img = await slideImage(userId);

    await updateScene(userId, id, middle.id, { expectedVersion: view.version, kind: "SLIDE", slideImageId: img.id, script: "Revenue grew." });
    await updateScene(userId, id, last.id, { expectedVersion: await version(id), script: "Thanks for watching." });
    view = await getProjectView(userId, id);
    expect(view.scenes[1]).toMatchObject({ kind: "SLIDE", slideImageId: img.id, avatarId, avatarLookId: lookId, voiceId: "v1" });
    expect(view.scenes[1].slideImage?.url).toBe(img.url);

    // Switch to Avatar and back: nothing is lost.
    await updateScene(userId, id, middle.id, { expectedVersion: view.version, kind: "AVATAR" });
    let again = await getProjectView(userId, id);
    expect(again.scenes[1]).toMatchObject({ kind: "AVATAR", slideImageId: img.id, script: "Revenue grew.", avatarId, avatarLookId: lookId });
    await updateScene(userId, id, middle.id, { expectedVersion: again.version, kind: "SLIDE" });
    again = await getProjectView(userId, id);

    heygen.createHeyGenStudioVideo.mockClear();
    const result = await generateProject(userId, id, again.version);
    expect(result).toMatchObject({ ok: true });
    expect(heygen.createHeyGenStudioVideo.mock.calls[0][0].scenes.map((s: { kind: string }) => s.kind)).toEqual(["avatar", "image", "avatar"]);
  });

  it("slides-only project generates and the video row has no avatar", async () => {
    const { id } = await createProject(userId, { title: "Slides only" });
    const view = await getProjectView(userId, id);
    await updateProject(userId, id, { expectedVersion: view.version, defaultVoiceId: "v1", defaultVoiceName: "Emma" });
    const img = await slideImage(userId);
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: await version(id), kind: "SLIDE", slideImageId: img.id, script: "Only a slide." });

    const result = await generateProject(userId, id, await version(id));
    expect(result).toMatchObject({ ok: true });
    const video = await prisma.generatedVideo.findFirstOrThrow({ where: { projectId: id } });
    expect(video.avatarId).toBeNull();
  });

  it("refuses another user's slide image and a stale version", async () => {
    const { id } = await createProject(userId, { title: "Security" });
    const view = await getProjectView(userId, id);
    const theirs = await slideImage(otherUserId);
    expect(await code(updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version, slideImageId: theirs.id }))).toBe("BAD_SLIDE");
    expect(await code(updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version - 1 + 0 || 999, script: "x" }))).toBe("VERSION_CONFLICT");
    // Another user can't even see the project.
    expect(await code(getProjectView(otherUserId, id))).toBe("NOT_FOUND");
  });

  it("image replacement: the scene points at the new slide; duplicates share it", async () => {
    const { id } = await createProject(userId, { title: "Replace" });
    const view = await getProjectView(userId, id);
    const a = await slideImage(userId);
    const b = await slideImage(userId);
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version, kind: "SLIDE", slideImageId: a.id, script: "Hi." });
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: await version(id), slideImageId: b.id });
    await duplicateScene(userId, id, view.scenes[0].id, await version(id));
    const after = await getProjectView(userId, id);
    expect(after.scenes.map((s) => s.slideImageId)).toEqual([b.id, b.id]);
  });

  it("import append and replace, with a text-less page kept and limits enforced", async () => {
    const { id } = await createProject(userId, { title: "Import" });
    const imgs = [await slideImage(userId), await slideImage(userId), await slideImage(userId)];
    const plan = planImportedScenes(
      [
        { scripts: ["Page one."], slideImageId: imgs[0].id },
        { scripts: [], slideImageId: imgs[1].id }, // picture-only page
        { scripts: ["Part A.", "Part B."], slideImageId: imgs[2].id }, // split page
      ],
      "Page",
      "SLIDE",
    );
    await importScenesFromDocument(userId, id, await version(id), plan.scenes, { pagesSkipped: plan.pagesSkipped });
    let view = await getProjectView(userId, id);
    expect(view.scenes.map((s) => [s.title, s.kind, s.script, s.sourcePageNumber])).toEqual([
      ["", "AVATAR", "", null], // the project's original empty scene, kept (append)
      ["Page 1", "SLIDE", "Page one.", 1],
      ["Page 2", "SLIDE", "", 2],
      ["Page 3 · Part 1", "SLIDE", "Part A.", 3],
      ["Page 3 · Part 2", "SLIDE", "Part B.", 3],
    ]);
    expect(view.scenes[3].slideImageId).toBe(view.scenes[4].slideImageId);

    // A stale-version replace changes nothing.
    expect(await code(importScenesFromDocument(userId, id, 1, plan.scenes, { replaceExisting: true }))).toBe("VERSION_CONFLICT");
    expect((await getProjectView(userId, id)).scenes).toHaveLength(5);

    // Replace swaps everything in one go.
    const fresh = planImportedScenes([{ scripts: ["Only."], slideImageId: imgs[0].id }], "Page", "AVATAR");
    await importScenesFromDocument(userId, id, await version(id), fresh.scenes, { replaceExisting: true });
    view = await getProjectView(userId, id);
    expect(view.scenes.map((s) => [s.kind, s.script, s.slideImageId])).toEqual([["AVATAR", "Only.", imgs[0].id]]);

    // Too many after splitting: refused, project unchanged.
    const big = planImportedScenes(Array.from({ length: 20 }, () => ({ scripts: ["x"], slideImageId: null })), "Page", "AVATAR");
    expect(await code(importScenesFromDocument(userId, id, await version(id), big.scenes))).toBe("LIMIT");
    expect((await getProjectView(userId, id)).scenes).toHaveLength(1);
  });

  it("bulk Show as: all-or-nothing when some scenes lack slides, then switches", async () => {
    const { id } = await createProject(userId, { title: "Bulk" });
    await addScene(userId, id, await version(id));
    const view = await getProjectView(userId, id);
    const img = await slideImage(userId);
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version, slideImageId: img.id });
    const ids = view.scenes.map((s) => s.id);

    expect(await code(setScenesPresentation(userId, id, ids, "SLIDE", await version(id)))).toBe("NO_SLIDE");
    expect((await getProjectView(userId, id)).scenes.map((s) => s.kind)).toEqual(["AVATAR", "AVATAR"]);

    await setScenesPresentation(userId, id, [ids[0]], "SLIDE", await version(id));
    expect((await getProjectView(userId, id)).scenes.map((s) => s.kind)).toEqual(["SLIDE", "AVATAR"]);
    await setScenesPresentation(userId, id, ids, "AVATAR", await version(id));
    const back = await getProjectView(userId, id);
    expect(back.scenes.map((s) => [s.kind, s.slideImageId])).toEqual([["AVATAR", img.id], ["AVATAR", null]]);
  });

  it("pruning: keeps used, fresh and rendered images; removes the rest, including after project deletion", async () => {
    const old = new Date(Date.now() - SLIDE_IMAGE_GRACE_MS - 60_000);
    const orphanOld = await slideImage(userId, old);
    const orphanFresh = await slideImage(userId);
    const usedOld = await slideImage(userId, old);
    const renderedOld = await slideImage(userId, old);

    const { id } = await createProject(userId, { title: "Prune" });
    const view = await getProjectView(userId, id);
    await updateScene(userId, id, view.scenes[0].id, { expectedVersion: view.version, slideImageId: usedOld.id });
    // A render of this project still shows renderedOld (e.g. in progress).
    await prisma.generatedVideo.create({
      data: { userId, projectId: id, script: "x", sceneSnapshot: [{ order: 1, kind: "SLIDE", mediaUrl: renderedOld.url }] },
    });

    blob.del.mockClear();
    await pruneUnusedSlideImages(userId);
    const left = new Set((await prisma.slideImage.findMany({ where: { userId }, select: { id: true } })).map((r) => r.id));
    expect(left.has(orphanOld.id)).toBe(false);
    expect(left.has(orphanFresh.id)).toBe(true);
    expect(left.has(usedOld.id)).toBe(true);
    expect(left.has(renderedOld.id)).toBe(true);
    expect(blob.del.mock.calls.flat(2)).toContain(orphanOld.url);

    // Deleting the project releases both (its render no longer belongs to a project).
    await deleteProject(userId, id);
    await pruneUnusedSlideImages(userId);
    const after = new Set((await prisma.slideImage.findMany({ where: { userId }, select: { id: true } })).map((r) => r.id));
    expect(after.has(usedOld.id)).toBe(false);
    expect(after.has(renderedOld.id)).toBe(false);
  });

  it("after-render removal: deletes slides a day after the video finished, detaches scenes, keeps the rest", async () => {
    const DAY = SLIDE_RETENTION_AFTER_RENDER_MS;
    const ago = (ms: number) => new Date(Date.now() - ms);
    const rendered = await slideImage(userId, ago(DAY * 2));
    const renderedRecently = await slideImage(userId, ago(DAY * 2));
    const neverRendered = await slideImage(userId, ago(DAY * 2));
    const otherUsers = await slideImage(otherUserId, ago(DAY * 2));
    await prisma.slideImage.update({ where: { id: rendered.id }, data: { renditions: { "16:9": `${rendered.url}-16x9` } } });

    const { id } = await createProject(userId, { title: "Retention" });
    await addScene(userId, id, await version(id));
    await addScene(userId, id, await version(id));
    const view = await getProjectView(userId, id);
    const imgs = [rendered, renderedRecently, neverRendered];
    for (const [i, s] of view.scenes.entries()) {
      await updateScene(userId, id, s.id, { expectedVersion: await version(id), kind: "SLIDE", slideImageId: imgs[i].id, script: "Narration." });
    }
    // Old finished render shows `rendered` (by its letterboxed copy) and the
    // other user's image; a recent one shows `renderedRecently`.
    await prisma.generatedVideo.create({
      data: {
        userId, projectId: id, script: "x", status: "COMPLETED", createdAt: ago(DAY + 7_200_000), completedAt: ago(DAY + 3_600_000),
        sceneSnapshot: [{ order: 1, kind: "SLIDE", mediaUrl: `${rendered.url}-16x9` }, { order: 2, kind: "SLIDE", mediaUrl: otherUsers.url }],
      },
    });
    await prisma.generatedVideo.create({
      data: {
        userId, projectId: id, script: "x", status: "COMPLETED", createdAt: ago(7_200_000), completedAt: ago(3_600_000),
        sceneSnapshot: [{ order: 1, kind: "SLIDE", mediaUrl: renderedRecently.url }],
      },
    });

    blob.del.mockClear();
    await removeSlideImagesAfterRender();
    const left = new Set((await prisma.slideImage.findMany({ where: { userId: { in: [userId, otherUserId] } }, select: { id: true } })).map((r) => r.id));
    expect(left.has(rendered.id)).toBe(false);
    expect(left.has(renderedRecently.id)).toBe(true);
    expect(left.has(neverRendered.id)).toBe(true);
    // Another user's render can't remove someone else's image.
    expect(left.has(otherUsers.id)).toBe(true);
    expect(blob.del.mock.calls.flat(2)).toEqual(expect.arrayContaining([rendered.url, `${rendered.url}-16x9`]));

    const after = await getProjectView(userId, id);
    expect(after.scenes[0]).toMatchObject({ kind: "SLIDE", slideImageId: null, slideImage: null, script: "Narration." });
    expect(after.scenes[1].slideImageId).toBe(renderedRecently.id);
    // Regenerating is refused with the clear "no slide image" message.
    const regenerate = await generateProject(userId, id, after.version);
    expect(regenerate).toMatchObject({ ok: false, code: "NOT_READY" });
    expect(regenerate.ok === false && "issues" in regenerate && regenerate.issues.map((i) => i.code)).toContain("NO_SLIDE");
  });

  it("custom backgrounds: ownership, duplication, readiness by look, generation and clean-up", async () => {
    const mineBg = await prisma.backgroundMedia.create({
      data: { userId, kind: "VIDEO", url: `https://x.public.blob.vercel-storage.com/backgrounds/${userId}/sea-${run}.mp4`, contentType: "video/mp4", sizeBytes: 1000 },
    });
    const theirsBg = await prisma.backgroundMedia.create({
      data: { userId: otherUserId, kind: "IMAGE", url: `https://x.public.blob.vercel-storage.com/backgrounds/${otherUserId}/o-${run}.jpg`, contentType: "image/jpeg", sizeBytes: 1000 },
    });
    const { id } = await createProject(userId, { title: "Backgrounds" });
    let view = await getProjectView(userId, id);
    await updateProject(userId, id, { expectedVersion: view.version, defaultVoiceId: "v1", defaultVoiceName: "Emma" });
    const first = view.scenes[0].id;

    // Someone else's background is refused; your own is saved and shown.
    expect(await code(updateScene(userId, id, first, { expectedVersion: await version(id), backgroundMediaId: theirsBg.id }))).toBe("BAD_BACKGROUND");
    await updateScene(userId, id, first, {
      expectedVersion: await version(id), avatarId, avatarLookId: lookId, script: "In front of the sea.", backgroundMediaId: mineBg.id,
    });
    view = await getProjectView(userId, id);
    expect(view.scenes[0].backgroundMedia).toEqual({ id: mineBg.id, kind: "VIDEO", url: mineBg.url });

    // A duplicate shares it; a new scene after it inherits it.
    await duplicateScene(userId, id, first, await version(id));
    await addScene(userId, id, await version(id), first);
    view = await getProjectView(userId, id);
    expect(view.scenes.map((s) => s.backgroundMediaId)).toEqual([mineBg.id, mineBg.id, mineBg.id]);
    for (const s of view.scenes.slice(1)) await updateScene(userId, id, s.id, { expectedVersion: await version(id), script: "More sea." });

    // The look isn't marked as supporting backgrounds yet: refused before anything is sent.
    heygen.createHeyGenStudioVideo.mockClear();
    const refused = await generateProject(userId, id, await version(id));
    expect(refused).toMatchObject({ ok: false, code: "NOT_READY" });
    expect(heygen.createHeyGenStudioVideo).not.toHaveBeenCalled();

    // Marked as supported: the background goes out with every scene.
    await prisma.avatarLook.update({ where: { id: lookId }, data: { backgroundRemoval: "SUPPORTED" } });
    expect(await generateProject(userId, id, await version(id))).toMatchObject({ ok: true });
    const sent = heygen.createHeyGenStudioVideo.mock.calls.at(-1)![0].scenes as { background?: unknown }[];
    expect(sent.every((s) => JSON.stringify(s.background) === JSON.stringify({ kind: "video", url: mineBg.url }))).toBe(true);
    await prisma.avatarLook.update({ where: { id: lookId }, data: { backgroundRemoval: "UNKNOWN" } });

    // Clean-up never removes a background a scene still uses, even when old.
    await prisma.backgroundMedia.updateMany({ where: { id: { in: [mineBg.id, theirsBg.id] } }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    blob.del.mockClear();
    await removeUnusedBackgroundMedia();
    const left = new Set((await prisma.backgroundMedia.findMany({ where: { id: { in: [mineBg.id, theirsBg.id] } }, select: { id: true } })).map((r) => r.id));
    expect(left.has(mineBg.id)).toBe(true);
    expect(left.has(theirsBg.id)).toBe(false);
    expect(blob.del.mock.calls.flat(2)).toContain(theirsBg.url);
  });

  it("bulk delete keeps at least one scene and leaves shared slides alone", async () => {
    const { id } = await createProject(userId, { title: "Delete" });
    const img = await slideImage(userId);
    await addScene(userId, id, await version(id));
    const view = await getProjectView(userId, id);
    for (const s of view.scenes) await updateScene(userId, id, s.id, { expectedVersion: await version(id), slideImageId: img.id });
    expect(await code(deleteScenes(userId, id, view.scenes.map((s) => s.id), await version(id)))).toBe("LAST_SCENE");
    await deleteScenes(userId, id, [view.scenes[0].id], await version(id));
    const after = await getProjectView(userId, id);
    expect(after.scenes).toHaveLength(1);
    expect(after.scenes[0].slideImageId).toBe(img.id);
  });
});
