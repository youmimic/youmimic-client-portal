import { estimateGeneration, formatDuration, type VideoEngineValue } from "@/lib/video-display";

// Pure business rules for multi-scene projects. Nothing here touches the
// database or browser APIs, so the same code validates on the server (the
// source of truth) and drives the readiness panel in the browser.

export const MAX_SCENES = 20;
export const SCENE_SCRIPT_MAX = 5000;
export const SCENE_TITLE_MAX = 80;
export const PROJECT_TITLE_MAX = 120;
// Above this estimated length we suggest splitting the scene. It is guidance
// only: the provider has no per-scene maximum.
export const LONG_SCENE_SECONDS = 60;

export type SceneData = {
  id: string;
  orderIndex: number;
  title: string;
  script: string;
  avatarId: string | null;
  avatarLookId: string | null;
  voiceId: string | null;
  voiceName: string | null;
  backgroundColor: string | null;
};

export type ProjectDefaults = {
  defaultAvatarId: string | null;
  defaultAvatarLookId: string | null;
  defaultVoiceId: string | null;
  defaultVoiceName: string | null;
};

export type AvatarOption = {
  id: string;
  name: string;
  // Thumbnail for the avatar itself: its first ready look, else any look.
  previewUrl: string | null;
  usable: boolean;
  looks: { id: string; name: string; ready: boolean; previewUrl: string | null; videoUrl: string | null }[];
};

export type ResolvedScene = {
  avatarId: string | null;
  avatarLookId: string | null;
  voiceId: string | null;
  voiceName: string | null;
  avatarInherited: boolean;
  voiceInherited: boolean;
};

// A scene that names its own avatar owns the look choice too. Otherwise both
// come from the project default.
export function resolveScene(scene: SceneData, defaults: ProjectDefaults): ResolvedScene {
  const ownAvatar = scene.avatarId !== null;
  const ownVoice = scene.voiceId !== null;
  return {
    avatarId: ownAvatar ? scene.avatarId : defaults.defaultAvatarId,
    avatarLookId: ownAvatar ? scene.avatarLookId : defaults.defaultAvatarLookId,
    voiceId: ownVoice ? scene.voiceId : defaults.defaultVoiceId,
    voiceName: ownVoice ? scene.voiceName : defaults.defaultVoiceName,
    avatarInherited: !ownAvatar,
    voiceInherited: !ownVoice,
  };
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type SceneIssue = {
  sceneId: string;
  sceneNumber: number;
  severity: "error" | "warning";
  code: "EMPTY_SCRIPT" | "SCRIPT_TOO_LONG" | "NO_AVATAR" | "AVATAR_NOT_READY" | "BAD_COLOR" | "LONG_SCENE";
  message: string;
};

export function sceneLabel(scene: SceneData, number: number): string {
  return scene.title.trim() ? `Scene ${number} (${scene.title.trim()})` : `Scene ${number}`;
}

export function validateScene(
  scene: SceneData,
  number: number,
  defaults: ProjectDefaults,
  avatars: AvatarOption[],
  engine: VideoEngineValue,
): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const label = sceneLabel(scene, number);
  const push = (severity: SceneIssue["severity"], code: SceneIssue["code"], message: string) =>
    issues.push({ sceneId: scene.id, sceneNumber: number, severity, code, message });

  const script = scene.script.trim();
  if (!script) {
    push("error", "EMPTY_SCRIPT", `${label} needs a script before it can be generated.`);
  } else if (scene.script.length > SCENE_SCRIPT_MAX) {
    push(
      "error",
      "SCRIPT_TOO_LONG",
      `${label} is over the ${SCENE_SCRIPT_MAX.toLocaleString("en-AU")} character limit. Shorten it or split it into two scenes.`,
    );
  } else {
    const seconds = estimateGeneration(script, engine).durationSeconds;
    if (seconds > LONG_SCENE_SECONDS) {
      push(
        "warning",
        "LONG_SCENE",
        `${label} is about ${formatDuration(seconds)}. For faster and more reliable results, consider splitting it into two scenes.`,
      );
    }
  }

  const resolved = resolveScene(scene, defaults);
  if (!resolved.avatarId) {
    push("error", "NO_AVATAR", `${label} needs an avatar. Choose one in the scene settings.`);
  } else {
    const avatar = avatars.find((a) => a.id === resolved.avatarId);
    const look = avatar?.looks.find((l) => l.id === resolved.avatarLookId);
    const readyAvatar =
      !!avatar && avatar.usable && (avatar.looks.length === 0 || (resolved.avatarLookId ? !!look?.ready : true));
    if (!readyAvatar) {
      push("error", "AVATAR_NOT_READY", `${label} uses an avatar or look that isn't ready yet. Choose another one.`);
    }
  }

  if (scene.backgroundColor !== null && !HEX_COLOR.test(scene.backgroundColor)) {
    push("error", "BAD_COLOR", `${label} has an invalid background colour. Use a hex value like #1f2937.`);
  }

  return issues;
}

export type SceneReadiness = "needs_attention" | "ready" | "draft";

export type ProjectReadiness = {
  issues: SceneIssue[];
  sceneStatus: Record<string, SceneReadiness>;
  sceneCount: number;
  readyCount: number;
  attentionCount: number;
  totalDurationSeconds: number;
  totalCredits: number;
  totalCostCents: number;
  waitMinutesLow: number;
  waitMinutesHigh: number;
  canGenerate: boolean;
  summary: string;
};

export function evaluateProject(
  scenes: SceneData[],
  defaults: ProjectDefaults,
  avatars: AvatarOption[],
  engine: VideoEngineValue,
): ProjectReadiness {
  const ordered = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const issues: SceneIssue[] = [];
  const sceneStatus: Record<string, SceneReadiness> = {};

  ordered.forEach((scene, i) => {
    const sceneIssues = validateScene(scene, i + 1, defaults, avatars, engine);
    issues.push(...sceneIssues);
    const hasError = sceneIssues.some((x) => x.severity === "error");
    const isBlank = !scene.script.trim() && !scene.title.trim();
    sceneStatus[scene.id] = hasError ? (isBlank ? "draft" : "needs_attention") : "ready";
  });

  // Estimates use the combined script, the same input the server reserves
  // credits against, so the number shown here is what gets reserved.
  const combined = ordered.map((s) => s.script.trim()).filter(Boolean).join("\n");
  const estimate = estimateGeneration(combined, engine);

  const readyCount = ordered.filter((s) => sceneStatus[s.id] === "ready").length;
  const attentionCount = ordered.length - readyCount;
  const canGenerate = ordered.length > 0 && attentionCount === 0;

  const summary = canGenerate
    ? `All ${ordered.length} ${ordered.length === 1 ? "scene is" : "scenes are"} ready.`
    : `${readyCount} of ${ordered.length} scenes are ready. Complete the remaining ${
        attentionCount === 1 ? "scene" : "scenes"
      } to generate the full video.`;

  return {
    issues,
    sceneStatus,
    sceneCount: ordered.length,
    readyCount,
    attentionCount,
    totalDurationSeconds: estimate.durationSeconds,
    totalCredits: estimate.credits,
    totalCostCents: estimate.costCents,
    waitMinutesLow: estimate.waitMinutesLow,
    waitMinutesHigh: estimate.waitMinutesHigh,
    canGenerate,
    summary,
  };
}

export function sceneDurationSeconds(scene: SceneData, engine: VideoEngineValue): number {
  return estimateGeneration(scene.script, engine).durationSeconds;
}
