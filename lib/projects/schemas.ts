import { z } from "zod";
import { VIDEO_ASPECT_RATIOS, VIDEO_ENGINES, VIDEO_RESOLUTIONS } from "@/lib/validations/video";
import { HEX_COLOR, PROJECT_TITLE_MAX, SCENE_SCRIPT_MAX, SCENE_TITLE_MAX } from "@/lib/projects/rules";

const id = z.string().trim().min(1).max(60);
const nullableId = id.nullable();

// Every mutating request carries the version the client last saw, so a save
// from a stale tab is rejected instead of overwriting newer edits.
const expectedVersion = z.number().int().positive();

export const createProjectSchema = z.object({
  title: z.string().trim().max(PROJECT_TITLE_MAX).optional(),
  avatarId: id.optional(),
});

export const updateProjectSchema = z
  .object({
    expectedVersion,
    title: z.string().trim().max(PROJECT_TITLE_MAX).optional(),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).optional(),
    resolution: z.enum(VIDEO_RESOLUTIONS).nullable().optional(),
    engine: z.enum(VIDEO_ENGINES).optional(),
    defaultAvatarId: nullableId.optional(),
    defaultAvatarLookId: nullableId.optional(),
    defaultVoiceId: nullableId.optional(),
    defaultVoiceName: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export const updateSceneSchema = z
  .object({
    expectedVersion,
    title: z.string().trim().max(SCENE_TITLE_MAX).optional(),
    // Not trimmed: people type spaces and newlines while writing. The limit is
    // generous so autosave never rejects a draft that is merely too long;
    // readiness reports the real limit.
    script: z.string().max(SCENE_SCRIPT_MAX * 2).optional(),
    avatarId: nullableId.optional(),
    avatarLookId: nullableId.optional(),
    voiceId: nullableId.optional(),
    voiceName: z.string().trim().max(200).nullable().optional(),
    backgroundColor: z.string().regex(HEX_COLOR, "Use a hex colour like #1f2937").nullable().optional(),
  })
  .strict();

export const addSceneSchema = z.object({
  expectedVersion,
  afterSceneId: id.optional(),
});

export const sceneActionSchema = z.object({ expectedVersion });

export const reorderScenesSchema = z.object({
  expectedVersion,
  orderedSceneIds: z.array(id).min(1).max(50),
});

export const generateProjectSchema = z.object({ expectedVersion });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;
