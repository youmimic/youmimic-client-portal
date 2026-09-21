"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarLookPicker } from "@/components/dashboard/project/avatar-look-picker";
import { EnginePicker } from "@/components/dashboard/engine-picker";
import { VoicePicker, type SelectedVoice } from "@/components/dashboard/video/voice-picker";
import type { HeyGenEngine } from "@/lib/heygen";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/lib/validations/video";
import { HEX_COLOR, resolveScene, type AvatarOption, type ProjectDefaults, type SceneData } from "@/lib/projects/rules";
import { ASPECT_RATIO_LABEL } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type SceneSettingsPatch = Partial<
  Pick<SceneData, "avatarId" | "avatarLookId" | "voiceId" | "voiceName" | "backgroundColor">
>;

export type ProjectSettingsPatch = Partial<
  Pick<ProjectDefaults, "defaultVoiceId" | "defaultVoiceName"> & {
    aspectRatio: string;
    resolution: string | null;
    engine: HeyGenEngine;
  }
>;

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
  disabled,
  onSceneChange,
  onProjectChange,
}: {
  scene: SceneData;
  sceneNumber: number;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  aspectRatio: string;
  resolution: string | null;
  engine: HeyGenEngine;
  disabled: boolean;
  onSceneChange: (patch: SceneSettingsPatch) => void;
  onProjectChange: (patch: ProjectSettingsPatch) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolved = resolveScene(scene, defaults);
  const bgOn = scene.backgroundColor !== null;
  const bgValid = scene.backgroundColor === null || HEX_COLOR.test(scene.backgroundColor);

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
          <AvatarLookPicker
            avatars={avatars}
            avatarId={resolved.avatarId}
            lookId={resolved.avatarLookId}
            disabled={disabled}
            onChange={(avatarId, lookId) => onSceneChange({ avatarId, avatarLookId: lookId })}
          />

          <div className="space-y-2">
            <VoicePicker
              value={voiceValue}
              disabled={disabled}
              defaultLabel={
                defaults.defaultVoiceId
                  ? `Using project voice: ${defaults.defaultVoiceName ?? "Chosen voice"}`
                  : "Avatar's own voice (default)"
              }
              onChange={(v) => onSceneChange({ voiceId: v?.id ?? null, voiceName: v?.name ?? null })}
            />
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

          <VoicePicker
            value={projectVoiceValue}
            disabled={disabled}
            onChange={(v) => onProjectChange({ defaultVoiceId: v?.id ?? null, defaultVoiceName: v?.name ?? null })}
          />

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
                    {[null, ...VIDEO_RESOLUTIONS].map((r) => (
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
                        {r ?? "Standard"}
                      </button>
                    ))}
                  </div>
                </div>
                <EnginePicker value={engine} onChange={(e) => onProjectChange({ engine: e })} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
