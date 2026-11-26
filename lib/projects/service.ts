import { Prisma } from "@/app/generated/prisma/client";
import { readAdjust } from "@/lib/backgrounds/adjust";
import type { VideoEngine, VideoGenerationStatus, VideoProjectStatus, WatermarkPosition } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { isPermutation, insertAfter, moveItem } from "@/lib/projects/ordering";
import { projectContentHash } from "@/lib/projects/hash";
import {
  MAX_SCENES,
  SCENE_SCRIPT_MAX,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
} from "@/lib/projects/rules";
import type { UpdateProjectInput, UpdateSceneInput } from "@/lib/projects/schemas";
import type { ImportedScene } from "@/lib/projects/import-plan";
import { avatarAccessWhere, ownAvatarWhere } from "@/lib/avatar-access";

// Data access for multi-scene projects. Every function takes the signed-in
// user's id and only ever reads or writes rows that user owns, so callers
// (API routes) cannot forget the ownership check.

export class ProjectError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "GENERATING"
      | "LIMIT"
      | "LAST_SCENE"
      | "BAD_REORDER"
      | "BAD_AVATAR"
      | "BAD_FILE"
      | "BAD_SLIDE"
      | "BAD_BACKGROUND"
      | "NO_SLIDE",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

export type FinalVideoView = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl: string | null;
  // Set only when captions were requested — see GeneratedVideo's schema
  // comment. Lets the viewer toggle which rendered file to watch instead of
  // us picking one.
  captionedVideoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  estimatedCostCents: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  sceneSnapshot: SnapshotScene[] | null;
};

export type SnapshotScene = {
  order: number;
  kind: "AVATAR" | "IMAGE" | "VIDEO" | "SLIDE";
  title: string;
  script: string;
  avatarName: string | null;
  voiceName: string | null;
  backgroundColor: string | null;
  mediaUrl: string | null;
  // AVATAR scenes with a custom photo/video background (added 2026-11-26;
  // older snapshots have neither field).
  backgroundUrl?: string | null;
  backgroundKind?: "IMAGE" | "VIDEO" | null;
};

export type ProjectView = {
  id: string;
  title: string;
  status: VideoProjectStatus;
  aspectRatio: string;
  resolution: string | null;
  engine: "AVATAR_III" | "AVATAR_IV" | "AVATAR_V";
  captionsEnabled: boolean;
  watermarkUrl: string | null;
  watermarkPosition: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
  defaults: ProjectDefaults;
  version: number;
  scenes: SceneData[];
  finalVideo: FinalVideoView | null;
  // True when the scenes have changed since the last render was requested.
  isOutdated: boolean;
  createdAt: string;
  updatedAt: string;
};

const sceneSelect = {
  id: true,
  orderIndex: true,
  title: true,
  script: true,
  kind: true,
  avatarId: true,
  avatarLookId: true,
  voiceId: true,
  voiceName: true,
  backgroundColor: true,
  mediaUrl: true,
  mediaDurationSeconds: true,
  motionPrompt: true,
  slideImageId: true,
  sourcePageNumber: true,
  slideImage: { select: { id: true, url: true, width: true, height: true } },
  backgroundMediaId: true,
  backgroundMedia: { select: { id: true, kind: true, url: true } },
  backgroundAdjust: true,
} as const;

type Tx = Prisma.TransactionClient;

// A generation that never produced a video row (for example the server
// stopped between reserving the project and calling the provider) would
// otherwise stay "Generating" forever.
const STUCK_GENERATING_MS = 2 * 60 * 1000;

function mapVideoStatus(status: VideoGenerationStatus): VideoProjectStatus {
  if (status === "COMPLETED") return "COMPLETED" as VideoProjectStatus;
  if (status === "FAILED") return "FAILED" as VideoProjectStatus;
  return "GENERATING" as VideoProjectStatus;
}

async function assertAvatarRefs(tx: Tx, userId: string, avatarId: string | null | undefined, lookId: string | null | undefined) {
  if (avatarId) {
    const avatar = await tx.avatar.findFirst({ where: { id: avatarId, ...avatarAccessWhere(userId) }, select: { id: true } });
    if (!avatar) throw new ProjectError("BAD_AVATAR", 422, "That avatar isn't available on your account.");
  }
  if (lookId) {
    if (!avatarId) throw new ProjectError("BAD_AVATAR", 422, "Pick an avatar before choosing a look.");
    const look = await tx.avatarLook.findFirst({ where: { id: lookId, avatarId }, select: { id: true } });
    if (!look) throw new ProjectError("BAD_AVATAR", 422, "That look doesn't belong to the chosen avatar.");
  }
}

// A background photo/video may only be used by scenes of the user who uploaded it.
async function assertBackgroundMedia(tx: Tx, userId: string, backgroundMediaId: string) {
  const media = await tx.backgroundMedia.findFirst({ where: { id: backgroundMediaId, userId }, select: { id: true } });
  if (!media) throw new ProjectError("BAD_BACKGROUND", 422, "That background isn't available on your account.");
}

// A slide image may only be shown by scenes of the user who uploaded it.
async function assertSlideImage(tx: Tx, userId: string, slideImageId: string) {
  const image = await tx.slideImage.findFirst({ where: { id: slideImageId, userId }, select: { id: true } });
  if (!image) throw new ProjectError("BAD_SLIDE", 422, "That slide image isn't available on your account.");
}

// Bumps the project version only if it still matches what the caller saw and
// the project isn't rendering. Runs inside the caller's transaction, so the
// edit and the version bump commit together.
async function lockAndBump(tx: Tx, userId: string, projectId: string, expectedVersion: number, data: Prisma.VideoProjectUpdateManyMutationInput = {}) {
  const result = await tx.videoProject.updateMany({
    where: { id: projectId, userId, version: expectedVersion, status: { not: "GENERATING" } },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count === 1) return;

  const current = await tx.videoProject.findFirst({ where: { id: projectId, userId }, select: { status: true } });
  if (!current) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");
  if (current.status === "GENERATING") {
    throw new ProjectError("GENERATING", 409, "This video is being generated. You can edit it again once it finishes.");
  }
  throw new ProjectError(
    "VERSION_CONFLICT",
    409,
    "This project was changed somewhere else, such as another tab. Reload to see the latest version.",
  );
}

// Database rows to SceneData: ordered, with the stored JSON adjustments read
// defensively (anything invalid counts as none).
export function toSceneData(rows: (Omit<SceneData, "backgroundAdjust"> & { backgroundAdjust: Prisma.JsonValue | null })[]): SceneData[] {
  return [...rows]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => ({ ...row, backgroundAdjust: readAdjust(row.backgroundAdjust) }));
}

function readSnapshot(value: Prisma.JsonValue | null): SnapshotScene[] | null {
  return Array.isArray(value) ? (value as unknown as SnapshotScene[]) : null;
}

export async function getProjectView(userId: string, projectId: string): Promise<ProjectView> {
  const project = await prisma.videoProject.findFirst({
    where: { id: projectId, userId },
    include: {
      scenes: { orderBy: { orderIndex: "asc" }, select: sceneSelect },
      generatedVideos: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");

  const latest = project.generatedVideos[0] ?? null;
  let status = project.status;

  // Keep the project's status in step with its latest render. The webhook and
  // refresh route only know about videos, not projects.
  if (latest) {
    status = mapVideoStatus(latest.status);
  } else if (status === "GENERATING" && Date.now() - project.updatedAt.getTime() > STUCK_GENERATING_MS) {
    status = "DRAFT" as VideoProjectStatus;
  } else if (status !== "DRAFT" && status !== "GENERATING") {
    status = "DRAFT" as VideoProjectStatus;
  }

  if (status !== project.status) {
    await prisma.videoProject.updateMany({ where: { id: project.id, userId }, data: { status } });
  }

  const scenes = toSceneData(project.scenes);
  const hash = projectContentHash({ ...project, engine: project.engine }, scenes);

  return {
    id: project.id,
    title: project.title,
    status,
    aspectRatio: project.aspectRatio,
    resolution: project.resolution,
    engine: project.engine,
    captionsEnabled: project.captionsEnabled,
    watermarkUrl: project.watermarkUrl,
    watermarkPosition: project.watermarkPosition,
    defaults: {
      defaultAvatarId: project.defaultAvatarId,
      defaultAvatarLookId: project.defaultAvatarLookId,
      defaultVoiceId: project.defaultVoiceId,
      defaultVoiceName: project.defaultVoiceName,
    },
    version: project.version,
    scenes,
    finalVideo: latest
      ? {
          id: latest.id,
          status: latest.status,
          videoUrl: latest.videoUrl,
          captionedVideoUrl: latest.captionedVideoUrl,
          thumbnailUrl: latest.thumbnailUrl,
          durationSeconds: latest.durationSeconds,
          estimatedCostCents: latest.estimatedCostCents,
          errorMessage: latest.errorMessage,
          createdAt: latest.createdAt.toISOString(),
          completedAt: latest.completedAt?.toISOString() ?? null,
          sceneSnapshot: readSnapshot(latest.sceneSnapshot),
        }
      : null,
    isOutdated: !!latest && !!project.lastGeneratedHash && project.lastGeneratedHash !== hash,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

const AVATAR_OPTION_SELECT = {
  id: true,
  name: true,
  status: true,
  previewUrl: true,
  heygenAvatarId: true,
  avatarType: true,
  looks: {
    orderBy: { name: "asc" as const },
    select: { id: true, name: true, status: true, previewUrl: true, videoUrl: true, defaultVoiceId: true, avatarType: true, backgroundRemoval: true },
  },
} satisfies Prisma.AvatarSelect;

type AvatarOptionRow = Prisma.AvatarGetPayload<{ select: typeof AVATAR_OPTION_SELECT }>;

function toAvatarOption(a: AvatarOptionRow, isPublic: boolean): AvatarOption {
  const readyLooks = a.looks.filter((l) => l.status === "ready");
  const usable = a.looks.length > 0 ? readyLooks.length > 0 : a.status === "ready" && !!a.heygenAvatarId;
  return {
    id: a.id,
    name: a.name,
    previewUrl: readyLooks[0]?.previewUrl ?? a.looks[0]?.previewUrl ?? a.previewUrl,
    usable,
    isPublic,
    avatarType: a.avatarType,
    looks: a.looks.map((l) => ({
      id: l.id,
      name: l.name,
      ready: l.status === "ready",
      previewUrl: l.previewUrl,
      // Shared avatars never offer an intro clip (owner's call, 2026-11-26).
      videoUrl: isPublic ? null : l.videoUrl,
      defaultVoiceId: l.defaultVoiceId,
      avatarType: l.avatarType,
      backgroundRemoval: l.backgroundRemoval,
    })),
  };
}

export async function listAvatarOptions(userId: string): Promise<AvatarOption[]> {
  const avatars = await prisma.avatar.findMany({
    where: ownAvatarWhere(userId),
    orderBy: { createdAt: "desc" },
    select: AVATAR_OPTION_SELECT,
  });
  return avatars.map((a) => toAvatarOption(a, false));
}

// Every avatar an admin has marked public (managed at /admin/avatars) —
// usable by any signed-in user regardless of owner, and never mixed into
// listAvatarOptions above even for the admin account that owns the row —
// callers that need "my avatars + shared avatars" call this alongside
// listAvatarOptions and merge; the two lists can never overlap.
export async function listPublicAvatarOptions(): Promise<AvatarOption[]> {
  const avatars = await prisma.avatar.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    select: AVATAR_OPTION_SELECT,
  });
  return avatars.map((a) => toAvatarOption(a, true));
}

// Scenes always carry their own avatar (there is no project-wide avatar in
// the editor). A new project starts with the avatar the person came from, or
// their only usable avatar if they have just one, so the first scene is
// ready to write straight away.
async function pickStartingAvatar(tx: Tx, userId: string, requested?: string): Promise<{ avatarId: string; lookId: string | null } | null> {
  let avatarId = requested ?? null;

  if (avatarId) {
    await assertAvatarRefs(tx, userId, avatarId, null);
  } else {
    const candidates = await tx.avatar.findMany({
      where: ownAvatarWhere(userId),
      select: { id: true, status: true, heygenAvatarId: true, _count: { select: { looks: true } }, looks: { where: { status: "ready" }, take: 1, select: { id: true } } },
    });
    const usable = candidates.filter((a) => a.looks.length > 0 || (a._count.looks === 0 && a.status === "ready" && !!a.heygenAvatarId));
    if (usable.length !== 1) return null;
    avatarId = usable[0].id;
  }

  const firstReady = await tx.avatarLook.findFirst({
    where: { avatarId, status: "ready" },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  return { avatarId, lookId: firstReady?.id ?? null };
}

export async function createProject(userId: string, input: { title?: string; avatarId?: string }): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const start = await pickStartingAvatar(tx, userId, input.avatarId);

    const project = await tx.videoProject.create({
      data: {
        userId,
        title: input.title ?? "",
        scenes: { create: [{ orderIndex: 0, avatarId: start?.avatarId ?? null, avatarLookId: start?.lookId ?? null }] },
      },
      select: { id: true },
    });
    return project;
  });
}

export async function updateProject(userId: string, projectId: string, input: UpdateProjectInput): Promise<{ version: number }> {
  const { expectedVersion, engine, watermarkPosition, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    const avatarId = rest.defaultAvatarId;
    if (avatarId !== undefined || rest.defaultAvatarLookId !== undefined) {
      const current = await tx.videoProject.findFirst({ where: { id: projectId, userId }, select: { defaultAvatarId: true } });
      await assertAvatarRefs(
        tx,
        userId,
        avatarId !== undefined ? avatarId : (current?.defaultAvatarId ?? null),
        rest.defaultAvatarLookId ?? null,
      );
    }

    const data: Prisma.VideoProjectUpdateManyMutationInput & Record<string, unknown> = { ...rest };
    if (engine) data.engine = engine.toUpperCase() as VideoEngine;
    if (watermarkPosition) data.watermarkPosition = watermarkPosition.toUpperCase() as WatermarkPosition;
    // Changing the default avatar without naming a look clears the old look.
    if (avatarId !== undefined && rest.defaultAvatarLookId === undefined) data.defaultAvatarLookId = null;

    await lockAndBump(tx, userId, projectId, expectedVersion, data);
    return { version: expectedVersion + 1 };
  });
}

export async function updateScene(userId: string, projectId: string, sceneId: string, input: UpdateSceneInput): Promise<{ version: number }> {
  const { expectedVersion, ...patch } = input;

  return prisma.$transaction(async (tx) => {
    const scene = await tx.videoScene.findFirst({
      where: { id: sceneId, projectId, project: { userId } },
      select: { id: true, avatarId: true },
    });
    if (!scene) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that scene.");

    if (patch.avatarId !== undefined || patch.avatarLookId !== undefined) {
      await assertAvatarRefs(
        tx,
        userId,
        patch.avatarId !== undefined ? patch.avatarId : scene.avatarId,
        patch.avatarLookId ?? null,
      );
    }

    if (patch.slideImageId) await assertSlideImage(tx, userId, patch.slideImageId);
    if (patch.backgroundMediaId) await assertBackgroundMedia(tx, userId, patch.backgroundMediaId);

    const { backgroundAdjust, ...rest } = patch;
    const data: Prisma.VideoSceneUncheckedUpdateInput = { ...rest };
    // Json columns need Prisma.DbNull to store SQL NULL.
    if (backgroundAdjust !== undefined) data.backgroundAdjust = backgroundAdjust ?? Prisma.DbNull;
    // Clearing the scene's avatar (back to the project default) clears its
    // look and choosing a new avatar without a look resets the look, so a
    // scene never points at a look from a different avatar.
    if (patch.avatarId !== undefined && patch.avatarLookId === undefined) data.avatarLookId = null;
    // Clearing the voice also clears its cached display name.
    if (patch.voiceId === null) data.voiceName = null;

    await lockAndBump(tx, userId, projectId, expectedVersion);
    await tx.videoScene.update({ where: { id: sceneId }, data });
    return { version: expectedVersion + 1 };
  });
}

async function renumber(tx: Tx, orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, index) => tx.videoScene.update({ where: { id }, data: { orderIndex: index } })));
}

export async function addScene(userId: string, projectId: string, expectedVersion: number, afterSceneId?: string): Promise<{ version: number; sceneId: string }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const existing = await tx.videoScene.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, kind: true, avatarId: true, avatarLookId: true, voiceId: true, voiceName: true, backgroundMediaId: true, backgroundAdjust: true },
    });
    if (existing.length >= MAX_SCENES) {
      throw new ProjectError("LIMIT", 422, `A video can have up to ${MAX_SCENES} scenes.`);
    }

    // A new scene starts with the same kind, avatar, look and voice as the
    // scene it follows (or the last scene), which is what people usually
    // want. Content fields (script, media link) are never carried over,
    // same as a fresh scene never inherits another scene's script.
    const anchor = existing.find((s) => s.id === afterSceneId) ?? existing[existing.length - 1];
    const created = await tx.videoScene.create({
      data: {
        projectId,
        orderIndex: existing.length,
        kind: anchor?.kind,
        avatarId: anchor?.avatarId ?? null,
        avatarLookId: anchor?.avatarLookId ?? null,
        voiceId: anchor?.voiceId ?? null,
        voiceName: anchor?.voiceName ?? null,
        backgroundMediaId: anchor?.backgroundMediaId ?? null,
        backgroundAdjust: anchor?.backgroundAdjust ?? Prisma.DbNull,
      },
      select: { id: true },
    });
    const afterIndex = afterSceneId ? existing.findIndex((s) => s.id === afterSceneId) : -1;
    const ids = insertAfter(existing.map((s) => s.id), afterIndex >= 0 ? afterIndex : null, created.id);
    await renumber(tx, ids);
    return { version: expectedVersion + 1, sceneId: created.id };
  });
}

// How many scenes a project has now, for the import route's early limit
// check before it does any expensive work. Scoped to the owner.
export async function countProjectScenes(userId: string, projectId: string): Promise<number> {
  const project = await prisma.videoProject.findFirst({
    where: { id: projectId, userId },
    select: { _count: { select: { scenes: true } } },
  });
  if (!project) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");
  return project._count.scenes;
}

// Saves the scenes planned from an imported document (lib/projects/
// import-plan.ts) in one short transaction, after all the slow work
// (rendering, uploads, AI) has finished. Existing scenes are only touched
// inside this transaction, so a failed or conflicting import never leaves a
// project half replaced. Version, ownership and the generation lock are
// checked here, at commit time, by lockAndBump.
export async function importScenesFromDocument(
  userId: string,
  projectId: string,
  expectedVersion: number,
  scenes: ImportedScene[],
  options: {
    // Every existing scene is deleted first, in this same transaction. Asked
    // up front in the UI (it can't be undone), never assumed.
    replaceExisting?: boolean;
    // Passed through to the result for the summary message.
    pagesSkipped?: number;
  } = {},
): Promise<{ version: number; firstSceneId: string | null; scenesAdded: number; pagesSkipped: number }> {
  const replaceExisting = options.replaceExisting ?? false;
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const existing = await tx.videoScene.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, avatarId: true, avatarLookId: true, voiceId: true, voiceName: true, backgroundMediaId: true, backgroundAdjust: true },
    });

    if (scenes.length === 0) {
      throw new ProjectError("BAD_FILE", 422, "Couldn't find any readable text or pages in that file.");
    }
    // A Slide scene without its image would be unusable, and silently
    // making it an Avatar scene instead is exactly what mustn't happen.
    if (scenes.some((s) => s.kind === "SLIDE" && !s.slideImageId)) {
      throw new ProjectError("NO_SLIDE", 422, "Some pages have no slide image, so they can't be imported as slides.");
    }
    const imageIds = [...new Set(scenes.map((s) => s.slideImageId).filter((id): id is string => !!id))];
    if (imageIds.length > 0) {
      const owned = await tx.slideImage.count({ where: { id: { in: imageIds }, userId } });
      if (owned !== imageIds.length) throw new ProjectError("BAD_SLIDE", 422, "That slide image isn't available on your account.");
    }

    // Scenes about to be replaced don't count against the limit.
    const kept = replaceExisting ? [] : existing;
    if (kept.length + scenes.length > MAX_SCENES) {
      throw new ProjectError(
        "LIMIT",
        422,
        `This would add ${scenes.length} scenes, but a video can have up to ${MAX_SCENES} in total${
          replaceExisting ? "" : ` (this project already has ${kept.length})`
        }. Nothing was changed.`,
      );
    }

    if (replaceExisting && existing.length > 0) {
      await tx.videoScene.deleteMany({ where: { projectId } });
    }

    // Same inheritance as addScene: every imported scene starts on the
    // project's current avatar/look/voice (whatever the last kept scene
    // used) rather than nobody, so the user doesn't have to re-pick an
    // avatar for every single imported page. Nothing to inherit when
    // replacing everything — every imported scene starts with no avatar.
    const anchor = kept[kept.length - 1];
    let firstSceneId: string | null = null;
    const newIds: string[] = [];
    for (const [i, scene] of scenes.entries()) {
      const created = await tx.videoScene.create({
        data: {
          projectId,
          orderIndex: kept.length + i,
          kind: scene.kind,
          title: scene.title.slice(0, 80),
          script: scene.script.slice(0, SCENE_SCRIPT_MAX * 2),
          avatarId: anchor?.avatarId ?? null,
          avatarLookId: anchor?.avatarLookId ?? null,
          voiceId: anchor?.voiceId ?? null,
          voiceName: anchor?.voiceName ?? null,
          backgroundMediaId: anchor?.backgroundMediaId ?? null,
          backgroundAdjust: anchor?.backgroundAdjust ?? Prisma.DbNull,
          slideImageId: scene.slideImageId,
          sourcePageNumber: scene.sourcePageNumber,
        },
        select: { id: true },
      });
      if (firstSceneId === null) firstSceneId = created.id;
      newIds.push(created.id);
    }
    await renumber(tx, [...kept.map((s) => s.id), ...newIds]);
    return { version: expectedVersion + 1, firstSceneId, scenesAdded: scenes.length, pagesSkipped: options.pagesSkipped ?? 0 };
  });
}

export async function duplicateScene(userId: string, projectId: string, sceneId: string, expectedVersion: number): Promise<{ version: number; sceneId: string }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const scenes = await tx.videoScene.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" } });
    const source = scenes.find((s) => s.id === sceneId);
    if (!source) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that scene.");
    if (scenes.length >= MAX_SCENES) throw new ProjectError("LIMIT", 422, `A video can have up to ${MAX_SCENES} scenes.`);

    const copy = await tx.videoScene.create({
      data: {
        projectId,
        orderIndex: scenes.length,
        title: source.title ? `${source.title} (copy)`.slice(0, 80) : "",
        script: source.script,
        kind: source.kind,
        avatarId: source.avatarId,
        avatarLookId: source.avatarLookId,
        voiceId: source.voiceId,
        voiceName: source.voiceName,
        backgroundColor: source.backgroundColor,
        mediaUrl: source.mediaUrl,
        mediaDurationSeconds: source.mediaDurationSeconds,
        motionPrompt: source.motionPrompt,
        // The copy shows the same slide: the image row is shared, not copied.
        slideImageId: source.slideImageId,
        sourcePageNumber: source.sourcePageNumber,
        backgroundMediaId: source.backgroundMediaId,
        backgroundAdjust: source.backgroundAdjust ?? Prisma.DbNull,
      },
      select: { id: true },
    });
    const ids = insertAfter(scenes.map((s) => s.id), scenes.findIndex((s) => s.id === sceneId), copy.id);
    await renumber(tx, ids);
    return { version: expectedVersion + 1, sceneId: copy.id };
  });
}

export async function deleteScene(userId: string, projectId: string, sceneId: string, expectedVersion: number): Promise<{ version: number }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const scenes = await tx.videoScene.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" }, select: { id: true } });
    if (!scenes.some((s) => s.id === sceneId)) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that scene.");
    if (scenes.length <= 1) {
      throw new ProjectError("LAST_SCENE", 422, "A video needs at least one scene. Add another scene before deleting this one.");
    }
    await tx.videoScene.delete({ where: { id: sceneId } });
    await renumber(tx, scenes.filter((s) => s.id !== sceneId).map((s) => s.id));
    return { version: expectedVersion + 1 };
  });
}

// Switches several scenes between Avatar and Slide + narration in one
// transaction. Only the kind changes, so scripts, voices, avatars, looks and
// slide images all survive. Switching to Slide is all or nothing: if any
// selected scene has no slide image, nothing changes and the error names
// them, so there's never a silent partial switch.
export async function setScenesPresentation(
  userId: string,
  projectId: string,
  sceneIds: string[],
  kind: "AVATAR" | "SLIDE",
  expectedVersion: number,
): Promise<{ version: number; updated: number }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const scenes = await tx.videoScene.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, title: true, slideImageId: true },
    });
    const wanted = new Set(sceneIds);
    const known = new Set(scenes.map((s) => s.id));
    if ([...wanted].some((id) => !known.has(id))) {
      throw new ProjectError("NOT_FOUND", 404, "We couldn't find one or more of those scenes. Reload and try again.");
    }
    if (kind === "SLIDE") {
      const missing = scenes
        .map((s, i) => ({ ...s, number: i + 1 }))
        .filter((s) => wanted.has(s.id) && !s.slideImageId);
      if (missing.length > 0) {
        const names = missing.map((s) => (s.title.trim() ? `${s.number} (${s.title.trim()})` : `${s.number}`)).join(", ");
        throw new ProjectError(
          "NO_SLIDE",
          422,
          `${missing.length === 1 ? "Scene" : "Scenes"} ${names} ${missing.length === 1 ? "has" : "have"} no slide image, so nothing was changed. Add slide images or untick ${missing.length === 1 ? "it" : "them"}.`,
        );
      }
    }
    await tx.videoScene.updateMany({ where: { projectId, id: { in: [...wanted] } }, data: { kind } });
    return { version: expectedVersion + 1, updated: wanted.size };
  });
}

// Deletes several scenes in one transaction, so a selection is removed
// entirely or not at all. Same rules as deleteScene: every id must belong to
// this project and at least one scene must remain.
export async function deleteScenes(
  userId: string,
  projectId: string,
  sceneIds: string[],
  expectedVersion: number,
): Promise<{ version: number; deleted: number }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const scenes = await tx.videoScene.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" }, select: { id: true } });
    const toDelete = new Set(sceneIds);
    const known = new Set(scenes.map((s) => s.id));
    if ([...toDelete].some((id) => !known.has(id))) {
      throw new ProjectError("NOT_FOUND", 404, "We couldn't find one or more of those scenes. Reload and try again.");
    }
    const remaining = scenes.filter((s) => !toDelete.has(s.id));
    if (remaining.length === 0) {
      throw new ProjectError("LAST_SCENE", 422, "A video needs at least one scene. Keep at least one scene when deleting.");
    }
    await tx.videoScene.deleteMany({ where: { projectId, id: { in: [...toDelete] } } });
    await renumber(tx, remaining.map((s) => s.id));
    return { version: expectedVersion + 1, deleted: toDelete.size };
  });
}

export async function reorderScenes(userId: string, projectId: string, orderedSceneIds: string[], expectedVersion: number): Promise<{ version: number }> {
  return prisma.$transaction(async (tx) => {
    await lockAndBump(tx, userId, projectId, expectedVersion);
    const scenes = await tx.videoScene.findMany({ where: { projectId }, select: { id: true } });
    if (!isPermutation(scenes.map((s) => s.id), orderedSceneIds)) {
      throw new ProjectError("BAD_REORDER", 422, "The scene order doesn't match this project. Reload and try again.");
    }
    await renumber(tx, orderedSceneIds);
    return { version: expectedVersion + 1 };
  });
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const result = await prisma.videoProject.deleteMany({ where: { id: projectId, userId, status: { not: "GENERATING" } } });
  if (result.count > 0) return;

  const current = await prisma.videoProject.findFirst({ where: { id: projectId, userId }, select: { status: true } });
  if (!current) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");
  throw new ProjectError("GENERATING", 409, "This video is being generated. You can delete it once it finishes.");
}

export type ProjectSummary = {
  id: string;
  title: string;
  status: VideoProjectStatus;
  sceneCount: number;
  updatedAt: string;
  thumbnailUrl: string | null;
};

// Read-only list for the Videos page. Status follows the latest render the
// same way getProjectView does, but nothing is written back here.
export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await prisma.videoProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      defaultAvatarId: true,
      defaultAvatarLookId: true,
      _count: { select: { scenes: true } },
      scenes: { orderBy: { orderIndex: "asc" }, take: 1, select: { avatarId: true, avatarLookId: true } },
      generatedVideos: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, thumbnailUrl: true } },
    },
  });

  // Thumbnail = the look used by the first scene (the project's default look
  // for older projects whose scenes inherit it). Two batched lookups, both
  // limited to this user's avatars.
  const first = rows.map((p) => {
    const scene = p.scenes[0];
    const avatarId = scene?.avatarId ?? p.defaultAvatarId ?? null;
    const lookId = scene?.avatarId ? scene.avatarLookId : p.defaultAvatarLookId;
    return { avatarId, lookId };
  });
  const lookIds = [...new Set(first.map((f) => f.lookId).filter((x): x is string => !!x))];
  const avatarIds = [...new Set(first.map((f) => f.avatarId).filter((x): x is string => !!x))];

  const [looks, avatars] = await Promise.all([
    lookIds.length
      ? prisma.avatarLook.findMany({ where: { id: { in: lookIds }, avatar: { userId } }, select: { id: true, previewUrl: true } })
      : Promise.resolve([]),
    avatarIds.length
      ? prisma.avatar.findMany({
          where: { id: { in: avatarIds }, ...avatarAccessWhere(userId) },
          select: {
            id: true,
            previewUrl: true,
            looks: { where: { status: "ready" }, orderBy: { name: "asc" }, take: 1, select: { previewUrl: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const lookPreview = new Map(looks.map((l) => [l.id, l.previewUrl]));
  const avatarPreview = new Map(avatars.map((a) => [a.id, a.looks[0]?.previewUrl ?? a.previewUrl]));

  return rows.map((p, i) => {
    const latest = p.generatedVideos[0];
    const { avatarId, lookId } = first[i];
    const lookThumb = (lookId ? lookPreview.get(lookId) : null) ?? (avatarId ? avatarPreview.get(avatarId) : null) ?? null;
    return {
      id: p.id,
      title: p.title,
      status: latest ? mapVideoStatus(latest.status) : p.status === "GENERATING" ? ("DRAFT" as VideoProjectStatus) : p.status,
      sceneCount: p._count.scenes,
      updatedAt: p.updatedAt.toISOString(),
      thumbnailUrl: lookThumb ?? latest?.thumbnailUrl ?? null,
    };
  });
}

// Copies a project's scenes and settings into a new draft. The rendered video
// is not copied: the new project starts as a fresh draft.
export async function duplicateProject(userId: string, projectId: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const source = await tx.videoProject.findFirst({
      where: { id: projectId, userId },
      include: { scenes: { orderBy: { orderIndex: "asc" } } },
    });
    if (!source) throw new ProjectError("NOT_FOUND", 404, "We couldn't find that project.");

    const copy = await tx.videoProject.create({
      data: {
        userId,
        title: source.title ? `${source.title} (copy)`.slice(0, 120) : "",
        aspectRatio: source.aspectRatio,
        resolution: source.resolution,
        engine: source.engine,
        defaultAvatarId: source.defaultAvatarId,
        defaultAvatarLookId: source.defaultAvatarLookId,
        defaultVoiceId: source.defaultVoiceId,
        defaultVoiceName: source.defaultVoiceName,
        captionsEnabled: source.captionsEnabled,
        watermarkUrl: source.watermarkUrl,
        watermarkPosition: source.watermarkPosition,
        scenes: {
          create: source.scenes.map((sc, index) => ({
            orderIndex: index,
            title: sc.title,
            script: sc.script,
            kind: sc.kind,
            avatarId: sc.avatarId,
            avatarLookId: sc.avatarLookId,
            voiceId: sc.voiceId,
            voiceName: sc.voiceName,
            backgroundColor: sc.backgroundColor,
            mediaUrl: sc.mediaUrl,
            mediaDurationSeconds: sc.mediaDurationSeconds,
            motionPrompt: sc.motionPrompt,
            // Same owner, so the copy can share the slide image rows.
            slideImageId: sc.slideImageId,
            sourcePageNumber: sc.sourcePageNumber,
            backgroundMediaId: sc.backgroundMediaId,
            backgroundAdjust: sc.backgroundAdjust ?? Prisma.DbNull,
          })),
        },
      },
      select: { id: true },
    });
    return copy;
  });
}

export { moveItem };
