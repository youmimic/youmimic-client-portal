import { estimateGeneration, formatDuration, type VideoEngineValue } from "@/lib/video-display";
import type { BackgroundAdjust } from "@/lib/backgrounds/adjust";

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

// Which HeyGen avatar_type values actually honor the studio background.color
// field. Confirmed live (2026-11-02): "digital_twin" avatars — recorded
// video footage — silently ignore it; the request succeeds and a video
// renders, but the background stays whatever was in the original footage.
// "photo_avatar" was initially listed here as plausible (a still image
// composited live, not baked video) based on HeyGen's docs — confirmed live
// (2026-11-09, Chris Veltheim's "Etihad Tactician" look) to behave exactly
// the same as digital_twin: request succeeds, override is silently ignored.
// Empty until a type is found that actually honors it. Treat anything not
// in this set (including null/unknown) as unsupported: the UI control
// should stay hidden rather than show something that quietly does nothing.
//
// Those tests sent the colour WITHOUT remove_background. With it, the
// avatar is cut out and a background shows: photo and video backgrounds
// were verified with real renders on 2026-11-26 and are offered per look
// via AvatarLook.backgroundRemoval (see lookSupportsBackground below). This
// colour-only switch is left as it was.
export const SUPPORTED_BACKGROUND_AVATAR_TYPES = new Set<string>([]);

export function supportsBackgroundOverride(avatarType: string | null | undefined): boolean {
  return !!avatarType && SUPPORTED_BACKGROUND_AVATAR_TYPES.has(avatarType);
}

export type SceneKindValue = "AVATAR" | "IMAGE" | "VIDEO" | "SLIDE";
export const SCENE_KINDS: SceneKindValue[] = ["AVATAR", "IMAGE", "VIDEO", "SLIDE"];

export type SlideImageData = { id: string; url: string; width: number; height: number };

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
  // Shown by SLIDE scenes; kept whatever the kind so switching never loses it.
  slideImageId: string | null;
  slideImage: SlideImageData | null;
  sourcePageNumber: number | null;
  // AVATAR scenes: a photo/video shown behind the cut-out avatar. Null keeps
  // the look's own backdrop. Only looks marked SUPPORTED can use one.
  backgroundMediaId: string | null;
  backgroundMedia: BackgroundMediaRef | null;
  // Photo adjustments for that background (null = unadjusted).
  backgroundAdjust: BackgroundAdjust | null;
};

export type BackgroundMediaRef = { id: string; kind: "IMAGE" | "VIDEO"; url: string };
export type BackgroundRemovalValue = "UNKNOWN" | "SUPPORTED" | "UNSUPPORTED";

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
  // True for an admin-marked public avatar (managed at /admin/avatars),
  // usable by every user regardless of who actually owns the row — see
  // lib/avatar-access.ts. Purely a display/grouping flag here; access
  // control itself is enforced server-side, not by trusting this field.
  isPublic: boolean;
  // Only meaningful for a manually-linked avatar with no looks at all (see
  // Avatar.avatarType's schema comment) — ignored whenever looks is
  // non-empty, since each look carries its own avatarType instead.
  avatarType: string | null;
  looks: {
    id: string;
    name: string;
    ready: boolean;
    previewUrl: string | null;
    videoUrl: string | null;
    // HeyGen's own default voice for this specific look — used to offer
    // "same voice as this avatar" shortcuts elsewhere (see
    // lib/video-display.ts's avatarVoiceShortcuts). Different looks on the
    // same avatar can genuinely have different default voices.
    defaultVoiceId: string | null;
    // See SUPPORTED_BACKGROUND_AVATAR_TYPES above.
    avatarType: string | null;
    // Whether the provider can cut this look out for a photo/video
    // background (AvatarLook.backgroundRemoval).
    backgroundRemoval: BackgroundRemovalValue;
  }[];
};

// The look a scene actually renders with: its chosen look, or the avatar's
// first ready look (the same choice lib/projects/generate.ts makes).
export function effectiveLook(avatars: AvatarOption[], avatarId: string | null, lookId: string | null) {
  const avatar = avatarId ? avatars.find((a) => a.id === avatarId) : undefined;
  if (!avatar) return null;
  return lookId ? (avatar.looks.find((l) => l.id === lookId) ?? null) : (avatar.looks.find((l) => l.ready) ?? null);
}

// Custom photo/video backgrounds need a look verified to support background
// removal. Avatars without looks (the legacy single-id kind) never offer it.
export function lookSupportsBackground(avatars: AvatarOption[], avatarId: string | null, lookId: string | null): boolean {
  return effectiveLook(avatars, avatarId, lookId)?.backgroundRemoval === "SUPPORTED";
}

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
    | "PLACEHOLDER_TEXT"
    | "NO_MEDIA"
    | "BAD_MEDIA_URL"
    | "NO_DURATION"
    | "NO_VOICE"
    | "NO_SLIDE"
    | "BACKGROUND_NOT_SUPPORTED";
  message: string;
};

// Catches leftover placeholder text like "[name]" or "[Company]" — most
// often a hand-written draft that was never filled in, or an AI-generated
// script (see lib/ai/generate-script.ts) that left a bracket for a detail
// it couldn't know. A real script essentially never contains a literal
// square bracket, so this is a reliable enough signal for a warning without
// needing a fixed word list.
export const PLACEHOLDER_PATTERN = /\[[^[\]]+\]/;

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

  const placeholder = script.match(PLACEHOLDER_PATTERN);
  if (placeholder) {
    issues.push({
      sceneId: scene.id,
      sceneNumber: 0,
      severity: "warning",
      code: "PLACEHOLDER_TEXT",
      message: `${label} still has placeholder text: "${placeholder[0]}". Replace it before generating.`,
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

    if (scene.backgroundMedia && resolved.avatarId && !lookSupportsBackground(avatars, resolved.avatarId, resolved.avatarLookId)) {
      push(
        "error",
        "BACKGROUND_NOT_SUPPORTED",
        `${label} has a custom background, but its avatar look can't show one. Choose a look that supports backgrounds, or set the background back to Original.`,
      );
    }

    return issues.map((i) => ({ ...i, sceneNumber: number }));
  }

  if (scene.kind === "SLIDE") {
    if (!scene.slideImage) {
      push("error", "NO_SLIDE", `${label} is set to show a slide but has no slide image. Add one, or switch it to Avatar.`);
    }
    if (!script) {
      push("error", "EMPTY_SCRIPT", `${label} needs narration before it can be generated. Write what should be said over the slide.`);
    } else {
      pushScriptIssues(issues, scene, label, script, engine);
      // With no voice chosen, the scene's avatar's own voice narrates it
      // (lib/projects/generate.ts resolves it the same way as an avatar scene).
      const avatar = resolved.avatarId ? avatars.find((a) => a.id === resolved.avatarId) : undefined;
      if (!resolved.voiceId && !avatar?.usable) {
        push("error", "NO_VOICE", `${label} needs a voice for its narration. Choose one for the scene or set a project voice.`);
      }
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
    const hasContent = scene.script.trim() || scene.title.trim() || (scene.mediaUrl ?? "").trim() || scene.slideImage;
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

  // The provider accepts any mix of avatar, image and video scenes (its
  // docs: 1 to 50 scenes, each avatar_video, image or video), so this is a
  // business rule, not a provider one: a video needs at least one Avatar or
  // Slide + narration scene. Both always carry narration, and credits are
  // estimated from narration, so a video of only silent images or clips
  // (whose provider cost isn't confirmed) would reserve almost nothing.
  const projectIssue =
    ordered.length > 0 && !ordered.some((s) => s.kind === "AVATAR" || s.kind === "SLIDE")
      ? "Every video needs at least one Avatar or Slide + narration scene. Images and video clips on their own can't be generated yet."
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
