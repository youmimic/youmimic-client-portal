import type { Prisma } from "@/app/generated/prisma/client";
import type { VideoEngine, VideoGenerationStatus, VideoProjectStatus } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { isPermutation, insertAfter, moveItem } from "@/lib/projects/ordering";
import { projectContentHash } from "@/lib/projects/hash";
import {
  MAX_SCENES,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
} from "@/lib/projects/rules";
import type { UpdateProjectInput, UpdateSceneInput } from "@/lib/projects/schemas";

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
      | "BAD_AVATAR",
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
  kind: "AVATAR" | "IMAGE" | "VIDEO";
  title: string;
  script: string;
  avatarName: string | null;
  voiceName: string | null;
  backgroundColor: string | null;
  mediaUrl: string | null;
};

export type ProjectView = {
  id: string;
  title: string;
  status: VideoProjectStatus;
  aspectRatio: string;
  resolution: string | null;
  engine: "AVATAR_III" | "AVATAR_IV" | "AVATAR_V";
  captionsEnabled: boolean;
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
    const avatar = await tx.avatar.findFirst({ where: { id: avatarId, userId }, select: { id: true } });
    if (!avatar) throw new ProjectError("BAD_AVATAR", 422, "That avatar isn't available on your account.");
  }
  if (lookId) {
    if (!avatarId) throw new ProjectError("BAD_AVATAR", 422, "Pick an avatar before choosing a look.");
    const look = await tx.avatarLook.findFirst({ where: { id: lookId, avatarId }, select: { id: true } });
    if (!look) throw new ProjectError("BAD_AVATAR", 422, "That look doesn't belong to the chosen avatar.");
  }
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

function toSceneData(rows: SceneData[]): SceneData[] {
  return [...rows].sort((a, b) => a.orderIndex - b.orderIndex);
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

export async function listAvatarOptions(userId: string): Promise<AvatarOption[]> {
  const avatars = await prisma.avatar.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      previewUrl: true,
      heygenAvatarId: true,
      looks: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true, previewUrl: true, videoUrl: true },
      },
    },
  });

  return avatars.map((a) => {
    const readyLooks = a.looks.filter((l) => l.status === "ready");
    const usable = a.looks.length > 0 ? readyLooks.length > 0 : a.status === "ready" && !!a.heygenAvatarId;
    return {
      id: a.id,
      name: a.name,
      previewUrl: readyLooks[0]?.previewUrl ?? a.looks[0]?.previewUrl ?? a.previewUrl,
      usable,
      looks: a.looks.map((l) => ({
        id: l.id,
        name: l.name,
        ready: l.status === "ready",
        previewUrl: l.previewUrl,
        videoUrl: l.videoUrl,
      })),
    };
  });
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
      where: { userId },
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
  const { expectedVersion, engine, ...rest } = input;

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

    const data: Prisma.VideoSceneUpdateInput = { ...patch };
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
      select: { id: true, kind: true, avatarId: true, avatarLookId: true, voiceId: true, voiceName: true },
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
      },
      select: { id: true },
    });
    const afterIndex = afterSceneId ? existing.findIndex((s) => s.id === afterSceneId) : -1;
    const ids = insertAfter(existing.map((s) => s.id), afterIndex >= 0 ? afterIndex : null, created.id);
    await renumber(tx, ids);
    return { version: expectedVersion + 1, sceneId: created.id };
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
          where: { id: { in: avatarIds }, userId },
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
          })),
        },
      },
      select: { id: true },
    });
    return copy;
  });
}

export { moveItem };
