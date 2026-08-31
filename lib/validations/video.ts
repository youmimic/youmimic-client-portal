import { z } from "zod";

// Matches HeyGen's "engine" field on POST /v3/videos. Defaults to Avatar
// III (not HeyGen's own default of Avatar IV) — the lower-cost option,
// deliberately chosen as this app's default. See
// components/dashboard/engine-picker.tsx for the per-engine cost/quality
// tradeoffs shown to the user.
export const VIDEO_ENGINES = ["avatar_iii", "avatar_iv", "avatar_v"] as const;

// HeyGen's own script limit is 5000 characters. avatarLookId is optional —
// only required when the avatar has looks (imported from HeyGen); the route
// layer validates it belongs to the requested avatar.
export const generateVideoSchema = z.object({
  script: z.string().trim().min(1, "Script is required").max(5000, "Script must be 5000 characters or less"),
  avatarLookId: z.string().trim().min(1).optional(),
  engine: z.enum(VIDEO_ENGINES).default("avatar_iii"),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
