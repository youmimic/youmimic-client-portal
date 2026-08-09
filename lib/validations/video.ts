import { z } from "zod";

// HeyGen's own script limit is 5000 characters.
export const generateVideoSchema = z.object({
  script: z.string().trim().min(1, "Script is required").max(5000, "Script must be 5000 characters or less"),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
