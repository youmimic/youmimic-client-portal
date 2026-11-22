import { z } from "zod";

// A topic, not a full prompt — kept short so this can't be used as a
// backdoor for arbitrary long-form generation unrelated to a video script.
export const generateScriptSchema = z.object({
  topic: z.string().trim().min(3).max(300),
});

export type GenerateScriptInput = z.infer<typeof generateScriptSchema>;
