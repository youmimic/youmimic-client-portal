import { createHash } from "node:crypto";
import type { ProjectDefaults, SceneData } from "@/lib/projects/rules";
import { resolveScene } from "@/lib/projects/rules";

// Fingerprint of everything that changes what a rendered video looks or
// sounds like. Stored when a render is requested; if the current fingerprint
// differs later, the finished video is out of date.
// Scene titles are left out on purpose: renaming a scene doesn't change the
// video.
export function projectContentHash(
  project: ProjectDefaults & { aspectRatio: string; resolution: string | null; engine: string },
  scenes: SceneData[],
): string {
  const ordered = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const payload = {
    aspectRatio: project.aspectRatio,
    resolution: project.resolution,
    engine: project.engine,
    scenes: ordered.map((scene) => {
      const r = resolveScene(scene, project);
      return {
        script: scene.script.trim(),
        avatarId: r.avatarId,
        avatarLookId: r.avatarLookId,
        voiceId: r.voiceId,
        backgroundColor: scene.backgroundColor,
      };
    }),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
