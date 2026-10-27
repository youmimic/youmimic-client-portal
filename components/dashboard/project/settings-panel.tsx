"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarLookPicker } from "@/components/dashboard/project/avatar-look-picker";
import { EnginePicker } from "@/components/dashboard/engine-picker";
import { VoicePicker, type SelectedVoice } from "@/components/dashboard/video/voice-picker";
import type { HeyGenEngine } from "@/lib/heygen";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/lib/validations/video";
import {
  HEX_COLOR,
  MOTION_PROMPT_MAX,
  resolveScene,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
} from "@/lib/projects/rules";
import { ASPECT_RATIO_LABEL, avatarVoiceShortcuts } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type SceneSettingsPatch = Partial<
  Pick<SceneData, "avatarId" | "avatarLookId" | "voiceId" | "voiceName" | "backgroundColor" | "motionPrompt">
>;

export type ProjectSettingsPatch = Partial<
  Pick<ProjectDefaults, "defaultVoiceId" | "defaultVoiceName"> & {
    aspectRatio: string;
    resolution: string | null;
    engine: HeyGenEngine;
    captionsEnabled: boolean;
    watermarkUrl: string | null;
    watermarkPosition: WatermarkPosition;
  }
>;

export type WatermarkPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right";

const WATERMARK_POSITION_OPTIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top_left", label: "Top left" },
  { value: "top_right", label: "Top right" },
  { value: "bottom_left", label: "Bottom left" },
  { value: "bottom_right", label: "Bottom right" },
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function SettingsPanel({
  scene,
  sceneNumber,
  defaults,
  avatars,
  aspectRatio,
  resolution,
  engine,
  captionsEnabled,
  watermarkUrl,
  watermarkPosition,
  disabled,
  onSceneChange,
  onProjectChange,
  canViewCost,
}: {
  scene: SceneData;
  sceneNumber: number;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  aspectRatio: string;
  resolution: string | null;
  engine: HeyGenEngine;
  captionsEnabled: boolean;
  watermarkUrl: string | null;
  watermarkPosition: WatermarkPosition;
  disabled: boolean;
  onSceneChange: (patch: SceneSettingsPatch) => void;
  onProjectChange: (patch: ProjectSettingsPatch) => void;
  canViewCost: boolean;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [watermarkBusy, setWatermarkBusy] = useState(false);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);

  async function uploadWatermark(file: File) {
    setWatermarkError(null);
    setWatermarkBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/dashboard/media/upload-watermark", { method: "POST", body: formData });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setWatermarkError(json.error ?? "Couldn't upload that image.");
        return;
      }
      onProjectChange({ watermarkUrl: json.url });
    } catch {
      setWatermarkError("Couldn't upload that image.");
    } finally {
      setWatermarkBusy(false);
    }
  }
  const resolved = resolveScene(scene, defaults);
  const bgOn = scene.backgroundColor !== null;
  const bgValid = scene.backgroundColor === null || HEX_COLOR.test(scene.backgroundColor);
  const isAvatarScene = scene.kind === "AVATAR";
  // Confirmed live against the provider: motion_prompt is schema-valid only
  // on the Avatar V engine — sending it elsewhere is rejected. Not yet
  // exercised on a real avatar, only fake ones.
  const motionPromptAvailable = isAvatarScene && engine === "avatar_v";

  const voiceShortcuts = avatarVoiceShortcuts(avatars);

  const voiceValue: SelectedVoice = scene.voiceId ? { id: scene.voiceId, name: scene.voiceName ?? "Chosen voice" } : null;
  const projectVoiceValue: SelectedVoice = defaults.defaultVoiceId
    ? { id: defaults.defaultVoiceId, name: defaults.defaultVoiceName ?? "Chosen voice" }
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scene {sceneNumber} settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isAvatarScene && (
            <AvatarLookPicker
              avatars={avatars}
              avatarId={resolved.avatarId}
              lookId={resolved.avatarLookId}
              disabled={disabled}
              onChange={(avatarId, lookId) => onSceneChange({ avatarId, avatarLookId: lookId })}
            />
          )}

          <div className="space-y-2">
            <VoicePicker
              value={voiceValue}
              disabled={disabled}
              shortcuts={voiceShortcuts}
              defaultLabel={
                defaults.defaultVoiceId
                  ? `Using project voice: ${defaults.defaultVoiceName ?? "Chosen voice"}`
                  : isAvatarScene
                    ? "Avatar's own voice (default)"
                    : "No voice chosen"
              }
              onChange={(v) => onSceneChange({ voiceId: v?.id ?? null, voiceName: v?.name ?? null })}
            />
            {!isAvatarScene && (
              <p className="text-xs text-muted-foreground">Only used if this scene has narration.</p>
            )}
            {!resolved.voiceInherited && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onSceneChange({ voiceId: null, voiceName: null })}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset to project voice
              </Button>
            )}
          </div>

          {isAvatarScene && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Background colour</p>
              {bgOn ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a background colour"
                    disabled={disabled}
                    value={bgValid && scene.backgroundColor ? scene.backgroundColor : "#1f2937"}
                    onChange={(e) => onSceneChange({ backgroundColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    aria-label="Background colour hex value"
                    disabled={disabled}
                    value={scene.backgroundColor ?? ""}
                    onChange={(e) => onSceneChange({ backgroundColor: e.target.value })}
                    aria-invalid={!bgValid ? true : undefined}
                    className={cn(selectClass, "w-28 font-mono")}
                    maxLength={7}
                  />
                  <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onSceneChange({ backgroundColor: null })}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Using the avatar&apos;s own background.</p>
                  <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSceneChange({ backgroundColor: "#1f2937" })}>
                    Set a colour
                  </Button>
                </div>
              )}
            </div>
          )}

          {motionPromptAvailable && (
            <div className="space-y-1.5">
              <Label htmlFor="scene-motion-prompt">Motion and gestures (optional)</Label>
              <Textarea
                id="scene-motion-prompt"
                value={scene.motionPrompt ?? ""}
                maxLength={MOTION_PROMPT_MAX}
                disabled={disabled}
                onChange={(e) => onSceneChange({ motionPrompt: e.target.value || null })}
                placeholder="e.g. gestures warmly while speaking, calm and steady"
                className="min-h-20"
              />
              <p className="text-xs text-muted-foreground">
                Describes how animated this scene looks. Only applies with the Avatar V engine, and hasn&apos;t been
                tried against a real avatar yet, so treat it as experimental.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Scenes use the project voice unless you choose a different one for a scene. Format and quality apply to
            the whole video.
          </p>

          <label className="group/field flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={captionsEnabled}
              disabled={disabled}
              onCheckedChange={(checked) => onProjectChange({ captionsEnabled: checked === true })}
            />
            <span>
              <span className="block font-medium">Add captions</span>
              <span className="block text-xs text-muted-foreground">
                Burns readable subtitles into the video and gives you a downloadable subtitle file.
              </span>
            </span>
          </label>

          <VoicePicker
            value={projectVoiceValue}
            disabled={disabled}
            shortcuts={voiceShortcuts}
            onChange={(v) => onProjectChange({ defaultVoiceId: v?.id ?? null, defaultVoiceName: v?.name ?? null })}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium">Watermark</p>
            {watermarkUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL, same as image-crop-picker.tsx */}
                <img
                  src={watermarkUrl}
                  alt="Watermark preview"
                  className="h-10 w-10 rounded border border-input object-contain bg-muted p-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || watermarkBusy}
                  onClick={() => onProjectChange({ watermarkUrl: null })}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            {watermarkUrl && (
              <div role="group" aria-label="Watermark position" className="grid grid-cols-2 gap-2">
                {WATERMARK_POSITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={watermarkPosition === opt.value}
                    onClick={() => onProjectChange({ watermarkPosition: opt.value })}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                      watermarkPosition === opt.value ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {!watermarkUrl && (
              <div className="space-y-1.5">
                <Label htmlFor="project-watermark-upload" className="sr-only">
                  Upload a watermark image
                </Label>
                <input
                  id="project-watermark-upload"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={disabled || watermarkBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadWatermark(file);
                  }}
                  className="text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-2.5 file:py-1 file:text-xs file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  PNG or JPEG, shown as a small corner mark on the video. Optional.
                </p>
              </div>
            )}
            {watermarkBusy && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {watermarkError && <p className="text-xs text-destructive">{watermarkError}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="project-format">
              Format
            </p>
            <div role="group" aria-labelledby="project-format" className="grid grid-cols-2 gap-2">
              {VIDEO_ASPECT_RATIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  aria-pressed={aspectRatio === r}
                  onClick={() => onProjectChange({ aspectRatio: r })}
                  className={cn(
                    "rounded-md border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                    aspectRatio === r ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                  )}
                >
                  {ASPECT_RATIO_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              aria-expanded={advancedOpen}
              aria-controls="project-advanced"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
              Advanced settings
            </button>
            {advancedOpen && (
              <div id="project-advanced" className="mt-4 space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium" id="project-resolution">
                    Resolution
                  </p>
                  <div role="group" aria-labelledby="project-resolution" className="grid grid-cols-3 gap-2">
                    {[null, ...VIDEO_RESOLUTIONS]
                      .filter((r) => r !== "4k" || engine === "avatar_iii")
                      .map((r) => (
                        <button
                          key={r ?? "default"}
                          type="button"
                          disabled={disabled}
                          aria-pressed={resolution === r}
                          onClick={() => onProjectChange({ resolution: r })}
                          className={cn(
                            "rounded-md border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                            resolution === r ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                          )}
                        >
                          {r === "4k" ? "4K" : r ?? "Standard"}
                        </button>
                      ))}
                  </div>
                </div>
                <EnginePicker
                  value={engine}
                  onChange={(e) => {
                    // 4K is only available on Avatar III (lib/heygen/pricing.ts)
                    // — clear it when switching away so no unsupported
                    // engine+resolution combination lingers.
                    onProjectChange(e !== "avatar_iii" && resolution === "4k" ? { engine: e, resolution: null } : { engine: e });
                  }}
                  canViewCost={canViewCost}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
