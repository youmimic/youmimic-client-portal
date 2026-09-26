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

// A silent image scene's shown length — confirmed live against the provider
// as "0 < duration <= 300 seconds". Video scenes have no equivalent: a
// silent video scene plays at its own natural length instead (see
// lib/heygen.ts), so there is nothing to set here for those.
export const MIN_MEDIA_DURATION = 1;
export const MAX_MEDIA_DURATION = 300;
export const DEFAULT_MEDIA_DURATION = 5;
export const MOTION_PROMPT_MAX = 500;

export type SceneKindValue = "AVATAR" | "IMAGE" | "VIDEO";
export const SCENE_KINDS: SceneKindValue[] = ["AVATAR", "IMAGE", "VIDEO"];

export type SceneData = {
  id: string;
  orderIndex: number;
  title: string;
  script: string;
  kind: SceneKindValue;
  avatarId: string | null;
  avatarLookId: string | null;
  voiceId: string | null;
  voiceName: string | null;
  backgroundColor: string | null;
  // IMAGE/VIDEO scenes only — a link to an already-hosted image or clip.
  mediaUrl: string | null;
  // IMAGE scenes only, and only meaningful when the scene has no script.
  mediaDurationSeconds: number | null;
  // AVATAR scenes only. See lib/heygen.ts for engine restrictions.
  motionPrompt: string | null;
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
// come from the project default. Voice inheritance applies the same way to
// every scene kind: an IMAGE/VIDEO scene with narration uses its own voice,
// or falls back to the project's, exactly like an avatar scene does.
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

export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type SceneIssue = {
  sceneId: string;
  sceneNumber: number;
  severity: "error" | "warning";
  code:
    | "EMPTY_SCRIPT"
    | "SCRIPT_TOO_LONG"
    | "NO_AVATAR"
    | "AVATAR_NOT_READY"
    | "BAD_COLOR"
    | "LONG_SCENE"
    | "NO_MEDIA"
    | "BAD_MEDIA_URL"
    | "NO_DURATION"
    | "NO_VOICE";
  message: string;
};

export function sceneLabel(scene: SceneData, number: number): string {
  return scene.title.trim() ? `Scene ${number} (${scene.title.trim()})` : `Scene ${number}`;
}

function pushScriptIssues(
  issues: SceneIssue[],
  scene: SceneData,
  label: string,
  script: string,
  engine: VideoEngineValue,
) {
  if (scene.script.length > SCENE_SCRIPT_MAX) {
    issues.push({
      sceneId: scene.id,
      sceneNumber: 0,
      severity: "error",
      code: "SCRIPT_TOO_LONG",
      message: `${label} is over the ${SCENE_SCRIPT_MAX.toLocaleString("en-AU")} character limit. Shorten it or split it into two scenes.`,
    });
    return;
  }
  const seconds = estimateGeneration(script, engine).durationSeconds;
  if (seconds > LONG_SCENE_SECONDS) {
    issues.push({
      sceneId: scene.id,
      sceneNumber: 0,
      severity: "warning",
      code: "LONG_SCENE",
      message: `${label} is about ${formatDuration(seconds)}. For faster and more reliable results, consider splitting it into two scenes.`,
    });
  }
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
  const resolved = resolveScene(scene, defaults);

  if (scene.kind === "AVATAR") {
    if (!script) {
      push("error", "EMPTY_SCRIPT", `${label} needs a script before it can be generated.`);
    } else {
      pushScriptIssues(issues, scene, label, script, engine);
    }

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

    return issues.map((i) => ({ ...i, sceneNumber: number }));
  }

  // IMAGE / VIDEO
  const mediaUrl = scene.mediaUrl?.trim() ?? "";
  const mediaWord = scene.kind === "IMAGE" ? "an image" : "a video";
  if (!mediaUrl) {
    push("error", "NO_MEDIA", `${label} needs ${mediaWord} link before it can be generated.`);
  } else if (!isValidMediaUrl(mediaUrl)) {
    push("error", "BAD_MEDIA_URL", `${label}'s link doesn't look like a valid web address.`);
  }

  if (script) {
    pushScriptIssues(issues, scene, label, script, engine);
    if (!resolved.voiceId) {
      push("error", "NO_VOICE", `${label} needs a voice for its narration. Choose one in the scene settings or set a project voice.`);
    }
  } else if (scene.kind === "IMAGE") {
    const duration = scene.mediaDurationSeconds;
    if (duration === null || duration < MIN_MEDIA_DURATION || duration > MAX_MEDIA_DURATION) {
      push(
        "error",
        "NO_DURATION",
        `${label} needs either a script or a length from ${MIN_MEDIA_DURATION} to ${MAX_MEDIA_DURATION} seconds, so we know how long to show it.`,
      );
    }
  }
  // A silent VIDEO scene is fine as-is — it plays at the clip's own length.

  return issues.map((i) => ({ ...i, sceneNumber: number }));
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
  // A whole-project problem that isn't tied to one scene — currently only
  // "no avatar scene at all", since every render still has to link to one
  // of the user's avatars. Blocks generation the same as a scene error would.
  projectIssue: string | null;
  // True when a silent video scene is in the mix — its length isn't known
  // until the provider actually renders it, so the total above is a
  // minimum, not the real figure.
  hasUnknownDuration: boolean;
  // True when any image or video scene is in the project. The provider's
  // per-second rate for those scene types isn't confirmed, so the credit
  // and cost estimate below only reflects narrated (spoken) content.
  hasMediaScenes: boolean;
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
  let silentImageSeconds = 0;
  let hasUnknownDuration = false;
  let hasMediaScenes = false;

  ordered.forEach((scene, i) => {
    const sceneIssues = validateScene(scene, i + 1, defaults, avatars, engine);
    issues.push(...sceneIssues);
    const hasError = sceneIssues.some((x) => x.severity === "error");
    const hasContent = scene.script.trim() || scene.title.trim() || (scene.mediaUrl ?? "").trim();
    sceneStatus[scene.id] = hasError ? (hasContent ? "needs_attention" : "draft") : "ready";

    if (scene.kind !== "AVATAR") {
      hasMediaScenes = true;
      if (!scene.script.trim()) {
        if (scene.kind === "IMAGE") silentImageSeconds += scene.mediaDurationSeconds ?? 0;
        else hasUnknownDuration = true;
      }
    }
  });

  // Estimates use the combined script, the same input the server reserves
  // credits against, so the number shown here is what gets reserved. This
  // naturally covers narrated IMAGE/VIDEO scenes too, since narration is
  // driven by the same text-to-speech mechanism as an avatar scene.
  const combined = ordered.map((s) => s.script.trim()).filter(Boolean).join("\n");
  const estimate = estimateGeneration(combined, engine);

  const readyCount = ordered.filter((s) => sceneStatus[s.id] === "ready").length;
  const attentionCount = ordered.length - readyCount;

  // Every render still links to one of the user's avatars (GeneratedVideo
  // requires one), so a project made entirely of image/video scenes can't
  // be generated on its own — it needs at least one avatar scene somewhere.
  const projectIssue =
    ordered.length > 0 && !ordered.some((s) => s.kind === "AVATAR")
      ? "Add at least one avatar scene. Every video needs to include one of your avatars."
      : null;

  const canGenerate = ordered.length > 0 && attentionCount === 0 && !projectIssue;

  const summary =
    projectIssue ??
    (canGenerate
      ? `All ${ordered.length} ${ordered.length === 1 ? "scene is" : "scenes are"} ready.`
      : `${readyCount} of ${ordered.length} scenes are ready. Complete the remaining ${
          attentionCount === 1 ? "scene" : "scenes"
        } to generate the full video.`);

  return {
    issues,
    sceneStatus,
    sceneCount: ordered.length,
    readyCount,
    attentionCount,
    totalDurationSeconds: estimate.durationSeconds + silentImageSeconds,
    totalCredits: estimate.credits,
    totalCostCents: estimate.costCents,
    waitMinutesLow: estimate.waitMinutesLow,
    waitMinutesHigh: estimate.waitMinutesHigh,
    canGenerate,
    summary,
    projectIssue,
    hasUnknownDuration,
    hasMediaScenes,
  };
}

// The length shown for one scene in the sidebar. A silent image scene uses
// its set length; a silent video scene's length isn't knowable up front
// (null signals that to the caller, rather than a misleading "0s").
export function sceneDurationSeconds(scene: SceneData, engine: VideoEngineValue): number | null {
  if (!scene.script.trim()) {
    if (scene.kind === "IMAGE") return scene.mediaDurationSeconds ?? 0;
    if (scene.kind === "VIDEO") return null;
  }
  return estimateGeneration(scene.script, engine).durationSeconds;
}
