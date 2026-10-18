import { z } from "zod";
import { VIDEO_ASPECT_RATIOS } from "@/lib/validations/video";

// focusX/focusY are normalized (0-1) coordinates of the chosen focal point
// within the source image — see lib/media/crop.ts's computeCropBox.
export const cropImageSchema = z.object({
  sourceUrl: z.string().trim().url().max(2000),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
});

export type CropImageInput = z.infer<typeof cropImageSchema>;
