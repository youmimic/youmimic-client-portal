import { z } from "zod";

// HeyGen's own script limit is 5000 characters. avatarLookId is optional —
// only required when the avatar has looks (imported from HeyGen); the route
// layer validates it belongs to the requested avatar.
export const generateVideoSchema = z.object({
  script: z.string().trim().min(1, "Script is required").max(5000, "Script must be 5000 characters or less"),
  avatarLookId: z.string().trim().min(1).optional(),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
