"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SettingTarget } from "@/components/dashboard/project/generation-panel";
import { EnginePicker } from "@/components/dashboard/engine-picker";
import { VoicePicker, type SelectedVoice } from "@/components/dashboard/video/voice-picker";
import type { HeyGenEngine } from "@/lib/heygen";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/lib/validations/video";
import type { AvatarOption, ProjectDefaults } from "@/lib/projects/rules";
import { ASPECT_RATIO_LABEL, avatarVoiceShortcuts } from "@/lib/video-display";
import { cn } from "@/lib/utils";

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

type SavedWatermark = { id: string; url: string; createdAt: string };

const WATERMARK_POSITION_OPTIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top_left", label: "Top left" },
  { value: "top_right", label: "Top right" },
  { value: "bottom_left", label: "Bottom left" },
  { value: "bottom_right", label: "Bottom right" },
];

const optionClass = (selected: boolean) =>
  cn(
    "rounded-md border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
    selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
  );

// Where each jumpable setting lives in the DOM, kept as one map so the
// highlight effect and the section ids below can't drift apart. "title" is
// excluded: it lives in the page header (project-workspace.tsx's
// jumpToSetting handles it directly).
const SETTING_ELEMENT_ID: Record<Exclude<SettingTarget, "title">, string> = {
  format: "project-format-setting",
  resolution: "project-resolution-setting",
  engine: "project-engine-setting",
  voice: "project-voice-setting",
  captions: "project-captions-setting",
  watermark: "project-watermark-setting",
};

function highlightClass(active: boolean): string {
  return cn("rounded-lg transition-all", active && "-m-2 bg-primary/5 p-2 ring-2 ring-primary ring-offset-2");
}

// Settings that apply to the whole video. Per-scene settings (avatar, look,
// voice override, background) live in the scene editor.
export function VideoSettingsPanel({
  defaults,
  avatars,
  aspectRatio,
  resolution,
  engine,
  captionsEnabled,
  watermarkUrl,
  watermarkPosition,
  disabled,
  onProjectChange,
  canViewCost,
  highlight,
}: {
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  aspectRatio: string;
  resolution: string | null;
  engine: HeyGenEngine;
  captionsEnabled: boolean;
  watermarkUrl: string | null;
  watermarkPosition: WatermarkPosition;
  disabled: boolean;
  onProjectChange: (patch: ProjectSettingsPatch) => void;
  canViewCost: boolean;
  // Set briefly (see project-workspace.tsx's jumpToSetting) after the user
  // clicks a row in GenerationPanel's summary or one of its checks. This
  // panel scrolls to and flashes the matching control itself, since
  // resolution/engine sit behind its own collapsed "Advanced" toggle.
  highlight?: SettingTarget | null;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [watermarkBusy, setWatermarkBusy] = useState(false);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [savedWatermarks, setSavedWatermarks] = useState<SavedWatermark[] | null>(null);
  const [deletingWatermarkId, setDeletingWatermarkId] = useState<string | null>(null);

  // Expand "Advanced" the moment a highlight for resolution or engine
  // arrives. Adjusted during render rather than in an effect (React's
  // "update state in response to a prop change" pattern).
  const [lastHighlight, setLastHighlight] = useState(highlight);
  if (highlight !== lastHighlight) {
    setLastHighlight(highlight);
    if (highlight === "resolution" || highlight === "engine") setAdvancedOpen(true);
  }

  // The DOM scroll is a real effect: it runs after the render above has
  // committed, so a just-expanded section already exists.
  useEffect(() => {
    if (!highlight || highlight === "title") return;
    const id = SETTING_ELEMENT_ID[highlight];
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlight]);

  // Loaded once per panel mount. The library only changes through this
  // panel's own upload/delete actions, which keep local state in sync.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/media/watermarks")
      .then((res) => (res.ok ? res.json() : { watermarks: [] }))
      .then((json: { watermarks?: SavedWatermark[] }) => {
        if (!cancelled) setSavedWatermarks(json.watermarks ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedWatermarks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadWatermark(file: File) {
    setWatermarkError(null);
    setWatermarkBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/dashboard/media/upload-watermark", { method: "POST", body: formData });
      const json = (await res.json().catch(() => ({}))) as SavedWatermark & { error?: string };
      if (!res.ok || !json.url) {
        setWatermarkError(json.error ?? "Couldn't upload that image.");
        return;
      }
      setSavedWatermarks((prev) => [{ id: json.id, url: json.url, createdAt: json.createdAt }, ...(prev ?? [])]);
      onProjectChange({ watermarkUrl: json.url });
    } catch {
      setWatermarkError("Couldn't upload that image.");
    } finally {
      setWatermarkBusy(false);
    }
  }

  async function deleteSavedWatermark(saved: SavedWatermark) {
    setWatermarkError(null);
    setDeletingWatermarkId(saved.id);
    try {
      const res = await fetch(`/api/dashboard/media/watermarks/${saved.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setWatermarkError(json.error ?? "Couldn't delete that image.");
        return;
      }
      setSavedWatermarks((prev) => (prev ?? []).filter((w) => w.id !== saved.id));
    } catch {
      setWatermarkError("Couldn't delete that image.");
    } finally {
      setDeletingWatermarkId(null);
    }
  }

  const projectVoiceValue: SelectedVoice = defaults.defaultVoiceId
    ? { id: defaults.defaultVoiceId, name: defaults.defaultVoiceName ?? "Chosen voice" }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Video settings</CardTitle>
        <CardDescription className="text-xs">These apply to the whole video.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div id={SETTING_ELEMENT_ID.format} className={cn("space-y-2", highlightClass(highlight === "format"))}>
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
                className={optionClass(aspectRatio === r)}
              >
                {ASPECT_RATIO_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <label
          id={SETTING_ELEMENT_ID.captions}
          className={cn("group/field flex items-start gap-2.5 text-sm", highlightClass(highlight === "captions"))}
        >
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

        <div id={SETTING_ELEMENT_ID.voice} className={cn("space-y-1", highlightClass(highlight === "voice"))}>
          <VoicePicker
            value={projectVoiceValue}
            disabled={disabled}
            shortcuts={avatarVoiceShortcuts(avatars)}
            onChange={(v) => onProjectChange({ defaultVoiceId: v?.id ?? null, defaultVoiceName: v?.name ?? null })}
          />
          <p className="text-xs text-muted-foreground">Used by every scene that doesn&apos;t pick its own voice.</p>
        </div>

        <div id={SETTING_ELEMENT_ID.watermark} className={cn("space-y-2", highlightClass(highlight === "watermark"))}>
          <p className="text-sm font-medium">Watermark</p>
          {watermarkUrl ? (
            <>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL, same as image-crop-picker.tsx */}
                <img
                  src={watermarkUrl}
                  alt="Watermark preview"
                  className="h-10 w-10 rounded border border-input bg-muted object-contain p-1"
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
              <div role="group" aria-label="Watermark position" className="grid grid-cols-2 gap-2">
                {WATERMARK_POSITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={watermarkPosition === opt.value}
                    onClick={() => onProjectChange({ watermarkPosition: opt.value })}
                    className={optionClass(watermarkPosition === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {savedWatermarks && savedWatermarks.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Saved watermarks</p>
                  <div role="group" aria-label="Saved watermarks" className="flex flex-wrap gap-2">
                    {savedWatermarks.map((w) => (
                      <div key={w.id} className="group/saved relative">
                        <button
                          type="button"
                          disabled={disabled || watermarkBusy}
                          onClick={() => onProjectChange({ watermarkUrl: w.url })}
                          className="flex h-12 w-12 items-center justify-center rounded border border-input bg-muted p-1 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Use this watermark"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL, same as image-crop-picker.tsx */}
                          <img src={w.url} alt="" className="h-full w-full object-contain" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled || deletingWatermarkId === w.id}
                          onClick={() => void deleteSavedWatermark(w)}
                          aria-label="Delete this saved watermark"
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-input bg-background text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 group-hover/saved:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                  className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-2.5 file:py-1 file:text-xs file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  PNG or JPEG, shown as a small corner mark on the video. Saved for reuse in later videos. Optional.
                </p>
              </div>
            </div>
          )}
          {watermarkBusy && (
            <p role="status" className="text-xs text-muted-foreground">
              Uploading...
            </p>
          )}
          {watermarkError && (
            <p role="alert" className="text-xs text-destructive">
              {watermarkError}
            </p>
          )}
        </div>

        <div className="border-t pt-4">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="project-advanced"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
            Advanced: resolution and engine
          </button>
          {advancedOpen && (
            <div id="project-advanced" className="mt-4 space-y-5">
              <div id={SETTING_ELEMENT_ID.resolution} className={cn("space-y-2", highlightClass(highlight === "resolution"))}>
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
                        className={optionClass(resolution === r)}
                      >
                        {r === "4k" ? "4K" : (r ?? "Standard")}
                      </button>
                    ))}
                </div>
              </div>
              <div id={SETTING_ELEMENT_ID.engine} className={highlightClass(highlight === "engine")}>
                <EnginePicker
                  value={engine}
                  onChange={(e) => {
                    // 4K is only available on Avatar III (lib/heygen/pricing.ts),
                    // so clear it when switching away.
                    onProjectChange(e !== "avatar_iii" && resolution === "4k" ? { engine: e, resolution: null } : { engine: e });
                  }}
                  canViewCost={canViewCost}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
