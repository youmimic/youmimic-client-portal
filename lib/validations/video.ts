import { z } from "zod";

// Matches HeyGen's "engine" field on POST /v3/videos. Defaults to Avatar
// III (not HeyGen's own default of Avatar IV) — the lower-cost option,
// deliberately chosen as this app's default. See
// components/dashboard/engine-picker.tsx for the per-engine cost/quality
// tradeoffs shown to the user.
export const VIDEO_ENGINES = ["avatar_iii", "avatar_iv", "avatar_v"] as const;

// Subset of the provider's aspect ratios and resolutions offered in the UI.
// 4k is only available on Avatar III, for Digital Twin/Studio avatar looks
// (developers.heygen.com/reference/create-video) — enforced below via
// .refine(), not just in the UI. Its cost is also notably higher than
// standard resolution at the same engine — confirmed live, not documented
// by HeyGen — see lib/heygen/pricing.ts's AVATAR_III_4K_RATE_USD_PER_SECOND.
export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export const VIDEO_RESOLUTIONS = ["720p", "1080p", "4k"] as const;

// Matches HeyGen's watermark.placement.position field — confirmed live
// (2026-10-27). Only meaningful when a project has a watermarkUrl set.
export const WATERMARK_POSITIONS = ["top_left", "top_right", "bottom_left", "bottom_right"] as const;

// HeyGen's own script limit is 5000 characters. avatarLookId is optional —
// only required when the avatar has looks (imported from HeyGen); the route
// layer validates it belongs to the requested avatar. title, aspectRatio,
// resolution and voiceId are optional additions: leaving them out keeps the
// original behaviour (provider defaults and the look's own default voice).
export const generateVideoSchema = z
  .object({
    script: z.string().trim().min(1, "Script is required").max(5000, "Script must be 5000 characters or less"),
    avatarLookId: z.string().trim().min(1).optional(),
    engine: z.enum(VIDEO_ENGINES).default("avatar_iii"),
    title: z.string().trim().min(1).max(120, "Title must be 120 characters or less").optional(),
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).optional(),
    resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
    voiceId: z.string().trim().min(1).max(200).optional(),
    voiceName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => data.resolution !== "4k" || data.engine === "avatar_iii", {
    message: "4K is only available on Avatar III",
    path: ["resolution"],
  });

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
