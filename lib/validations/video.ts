import { z } from "zod";

// Matches HeyGen's "engine" field on POST /v3/videos. Defaults to Avatar
// III (not HeyGen's own default of Avatar IV) — the lower-cost option,
// deliberately chosen as this app's default. See
// components/dashboard/engine-picker.tsx for the per-engine cost/quality
// tradeoffs shown to the user.
export const VIDEO_ENGINES = ["avatar_iii", "avatar_iv", "avatar_v"] as const;

// Subset of the provider's aspect ratios and resolutions offered in the UI.
// 4k is left out on purpose: its credit cost isn't known yet.
export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;

// HeyGen's own script limit is 5000 characters. avatarLookId is optional —
// only required when the avatar has looks (imported from HeyGen); the route
// layer validates it belongs to the requested avatar. title, aspectRatio,
// resolution and voiceId are optional additions: leaving them out keeps the
// original behaviour (provider defaults and the look's own default voice).
export const generateVideoSchema = z.object({
  script: z.string().trim().min(1, "Script is required").max(5000, "Script must be 5000 characters or less"),
  avatarLookId: z.string().trim().min(1).optional(),
  engine: z.enum(VIDEO_ENGINES).default("avatar_iii"),
  title: z.string().trim().min(1).max(120, "Title must be 120 characters or less").optional(),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  voiceId: z.string().trim().min(1).max(200).optional(),
  voiceName: z.string().trim().min(1).max(200).optional(),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
