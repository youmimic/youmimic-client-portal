"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ChevronDown,
  Image as ImageIcon,
  ImageUp,
  Layers,
  Lightbulb,
  Loader2,
  Presentation,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
  UserCircle2,
  Video as VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InsertPauseButton } from "@/components/dashboard/video/insert-pause-button";
import { VoicePicker, type SelectedVoice } from "@/components/dashboard/video/voice-picker";
import { AvatarLookPicker, Thumb } from "@/components/dashboard/project/avatar-look-picker";
import { BackgroundPicker } from "@/components/dashboard/background-picker";
import type { BackgroundAdjust } from "@/lib/backgrounds/adjust";
import { GenerateScriptButton } from "@/components/dashboard/project/generate-script-button";
import { ImageCropPicker } from "@/components/dashboard/project/image-crop-picker";
import {
  DEFAULT_MEDIA_DURATION,
  HEX_COLOR,
  MAX_MEDIA_DURATION,
  MIN_MEDIA_DURATION,
  MOTION_PROMPT_MAX,
  resolveScene,
  SCENE_SCRIPT_MAX,
  SCENE_TITLE_MAX,
  supportsBackgroundOverride,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
  type SceneIssue,
  type SceneKindValue,
  type SlideImageData,
  type BackgroundMediaRef,
  lookSupportsBackground,
  effectiveLook,
} from "@/lib/projects/rules";
import { avatarVoiceShortcuts, estimateGeneration, formatDuration, wordCount, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type SceneEdit = Partial<
  Pick<SceneData, "title" | "script" | "kind" | "mediaUrl" | "mediaDurationSeconds">
>;

// Who speaks and how the scene looks. Kept apart from SceneEdit because the
// workspace sends avatar, look and voice changes to every ticked scene.
export type SceneSettingsPatch = Partial<
  Pick<SceneData, "avatarId" | "avatarLookId" | "voiceId" | "voiceName" | "backgroundColor" | "motionPrompt">
>;

export type SceneSelection = { count: number; includesThisScene: boolean } | null;

type Resolved = ReturnType<typeof resolveScene>;

const KIND_OPTIONS: { value: SceneKindValue; label: string; icon: typeof UserCircle2; hint: string }[] = [
  { value: "AVATAR", label: "Avatar", icon: UserCircle2, hint: "Your avatar speaks the script." },
  {
    value: "SLIDE",
    label: "Slide + narration",
    icon: Presentation,
    hint: "The slide fills the screen while the chosen voice reads the script. No avatar is shown.",
  },
  { value: "IMAGE", label: "Image", icon: ImageIcon, hint: "Any image from a link, silent or narrated." },
  { value: "VIDEO", label: "Video clip", icon: VideoIcon, hint: "A clip you already have, silent or narrated." },
];

const hexInputClass =
  "h-8 w-28 rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30";

function IssueList({ errors, warnings }: { errors: SceneIssue[]; warnings: SceneIssue[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <ul className="space-y-2" aria-live="polite">
      {errors.map((issue) => (
        <li
          key={issue.code}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {issue.message}
        </li>
      ))}
      {warnings.map((issue) => (
        <li
          key={issue.code}
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

// Compact segmented control. Arrow keys move between options, like a
// native radio group.
function KindSwitch({
  value,
  disabled,
  onChange,
}: {
  value: SceneKindValue;
  disabled: boolean;
  onChange: (kind: SceneKindValue) => void;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const current = KIND_OPTIONS.findIndex((o) => o.value === value);
    const next = (current + (e.key === "ArrowRight" ? 1 : -1) + KIND_OPTIONS.length) % KIND_OPTIONS.length;
    onChange(KIND_OPTIONS[next].value);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Scene type"
      onKeyDown={disabled ? undefined : handleKeyDown}
      className="inline-flex flex-wrap rounded-lg border bg-muted/50 p-0.5"
    >
      {KIND_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => !selected && onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectionNote({
  selection,
  fields = "Avatar, look and voice",
}: {
  selection: SceneSelection;
  // What this scene's panel can actually change for the whole selection.
  fields?: string;
}) {
  if (!selection) return null;
  if (selection.includesThisScene && selection.count > 1) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {fields} changes here apply to all <strong>{selection.count} selected scenes</strong>.
        </span>
      </p>
    );
  }
  if (!selection.includesThisScene) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        Changes here only affect this scene. Tick it in the scene list to change it along with the{" "}
        {selection.count} selected {selection.count === 1 ? "scene" : "scenes"}.
      </p>
    );
  }
  return null;
}

function VoiceField({
  scene,
  resolved,
  defaults,
  avatars,
  disabled,
  isAvatarScene,
  onSettingsChange,
}: {
  scene: SceneData;
  resolved: Resolved;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  disabled: boolean;
  isAvatarScene: boolean;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
}) {
  const value: SelectedVoice = scene.voiceId ? { id: scene.voiceId, name: scene.voiceName ?? "Chosen voice" } : null;
  const resetLabel = defaults.defaultVoiceId
    ? "Use the project voice"
    : isAvatarScene
      ? "Use the avatar's own voice"
      : "Remove voice";
  return (
    <div className="space-y-2">
      <VoicePicker
        value={value}
        disabled={disabled}
        shortcuts={avatarVoiceShortcuts(avatars)}
        defaultLabel={
          defaults.defaultVoiceId
            ? `Using project voice: ${defaults.defaultVoiceName ?? "Chosen voice"}`
            : isAvatarScene
              ? "Avatar's own voice (default)"
              : "No voice chosen"
        }
        onChange={(v) => onSettingsChange({ voiceId: v?.id ?? null, voiceName: v?.name ?? null })}
      />
      {!resolved.voiceInherited && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onSettingsChange({ voiceId: null, voiceName: null })}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {resetLabel}
        </Button>
      )}
    </div>
  );
}

function voiceSummary(scene: SceneData, defaults: ProjectDefaults): string {
  if (scene.voiceId) return scene.voiceName ?? "Chosen voice";
  if (defaults.defaultVoiceId) return `${defaults.defaultVoiceName ?? "Chosen voice"} (project voice)`;
  return "Avatar's own voice";
}

// The avatar scene's "who's speaking" summary. The full picker stays folded
// away behind Change, so the script remains the focus of the editor.
function SpeakerSection({
  scene,
  resolved,
  avatars,
  defaults,
  disabled,
  selection,
  onSettingsChange,
}: {
  scene: SceneData;
  resolved: Resolved;
  avatars: AvatarOption[];
  defaults: ProjectDefaults;
  disabled: boolean;
  selection: SceneSelection;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
}) {
  const avatar = avatars.find((a) => a.id === resolved.avatarId) ?? null;
  const look =
    avatar?.looks.find((l) => l.id === resolved.avatarLookId) ?? avatar?.looks.find((l) => l.ready) ?? null;
  // Open straight away when there's nothing chosen yet.
  const [open, setOpen] = useState(!avatar);
  const panelId = useId();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Who&apos;s speaking</p>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-3 p-3">
          <Thumb
            src={look?.previewUrl ?? avatar?.previewUrl ?? null}
            className="h-14 w-14 rounded-md ring-1 ring-foreground/10"
            iconClass="h-7 w-7"
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{avatar ? avatar.name : "No avatar chosen"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {avatar
                ? look && avatar.looks.length > 1
                  ? `${look.name} look`
                  : "Default look"
                : "Choose who appears in this scene."}
            </p>
            <p className="truncate text-xs text-muted-foreground">Voice: {voiceSummary(scene, defaults)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={panelId}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Done" : "Change"}
          </Button>
        </div>
        {open && (
          <div id={panelId} className="space-y-5 border-t bg-muted/20 p-3">
            <SelectionNote selection={selection} />
            <AvatarLookPicker
              avatars={avatars}
              avatarId={resolved.avatarId}
              lookId={resolved.avatarLookId}
              disabled={disabled}
              onChange={(avatarId, lookId) => onSettingsChange({ avatarId, avatarLookId: lookId })}
            />
            <VoiceField
              scene={scene}
              resolved={resolved}
              defaults={defaults}
              avatars={avatars}
              disabled={disabled}
              isAvatarScene
              onSettingsChange={onSettingsChange}
            />
          </div>
        )}
      </div>
      {!open && <SelectionNote selection={selection} />}
    </div>
  );
}

function ScriptTips() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
        Writing tips
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul id={id} className="mt-2 space-y-1.5 rounded-md bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Keep scenes short.</span> Under a minute each is easiest to
            follow. Start a new scene for a new topic.
          </li>
          <li>
            <span className="font-medium text-foreground">Pauses.</span> Insert pause adds a short break. It only
            works with voices tagged &quot;Pauses&quot; in the voice list.
          </li>
          <li>
            <span className="font-medium text-foreground">End calmly.</span> The video stops on whatever frame the
            speech ends on, so finish the last scene with a short, still line such as &quot;Thanks for
            watching.&quot; Ending mid-gesture can look awkward.
          </li>
        </ul>
      )}
    </div>
  );
}

function ScriptField({
  scene,
  engine,
  disabled,
  label,
  placeholder,
  rows,
  className,
  headerNote,
  emptyNote,
  extraNote,
  showTips,
  onChange,
}: {
  scene: SceneData;
  engine: VideoEngineValue;
  disabled: boolean;
  label: string;
  placeholder: string;
  rows: number;
  className: string;
  headerNote?: ReactNode;
  // Shown in place of the word count while the script is empty.
  emptyNote?: string;
  extraNote?: string;
  showTips: boolean;
  onChange: (patch: SceneEdit) => void;
}) {
  const scriptRef = useRef<HTMLTextAreaElement | null>(null);
  const words = wordCount(scene.script);
  const estimate = estimateGeneration(scene.script, engine);
  const overLimit = scene.script.length > SCENE_SCRIPT_MAX;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Label htmlFor="scene-script">{label}</Label>
        <div className="flex items-center gap-2">
          {headerNote}
          <GenerateScriptButton disabled={disabled} onGenerated={(script) => onChange({ script })} />
          <InsertPauseButton
            textareaRef={scriptRef}
            value={scene.script}
            disabled={disabled}
            onInsert={(next) => onChange({ script: next })}
          />
        </div>
      </div>
      <Textarea
        id="scene-script"
        ref={scriptRef}
        value={scene.script}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange({ script: e.target.value })}
        aria-describedby="scene-script-help"
        placeholder={placeholder}
        className={className}
      />
      <div
        id="scene-script-help"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        <span>
          {words === 0 && emptyNote ? (
            emptyNote
          ) : (
            <>
              {words} {words === 1 ? "word" : "words"}
              {words > 0 && <> · about {formatDuration(estimate.durationSeconds)} spoken</>}
              {extraNote && <> · {extraNote}</>}
            </>
          )}
        </span>
        <span className={cn("tabular-nums", overLimit && "font-medium text-destructive")}>
          {scene.script.length.toLocaleString("en-AU")}/{SCENE_SCRIPT_MAX.toLocaleString("en-AU")}
        </span>
      </div>
      {showTips && <ScriptTips />}
    </div>
  );
}

// Background colour and motion are per-scene extras that most people never
// touch, so they live behind a toggle. Neither is applied to other ticked
// scenes.
function MoreOptions({
  scene,
  resolved,
  avatars,
  engine,
  disabled,
  onSettingsChange,
}: {
  scene: SceneData;
  resolved: Resolved;
  avatars: AvatarOption[];
  engine: VideoEngineValue;
  disabled: boolean;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
}) {
  const [open, setOpen] = useState(scene.backgroundColor !== null || !!scene.motionPrompt);
  const id = useId();

  // Only some avatar types honour a background colour (see
  // SUPPORTED_BACKGROUND_AVATAR_TYPES in lib/projects/rules.ts).
  const avatar = avatars.find((a) => a.id === resolved.avatarId);
  const look = avatar?.looks.find((l) => l.id === resolved.avatarLookId);
  const avatarType = look ? look.avatarType : (avatar?.looks.length ?? 0) === 0 ? (avatar?.avatarType ?? null) : null;
  const backgroundAvailable = supportsBackgroundOverride(avatarType);
  // motion_prompt is only accepted on the Avatar V engine.
  const motionAvailable = engine === "AVATAR_V";
  if (!backgroundAvailable && !motionAvailable) return null;

  const bgOn = scene.backgroundColor !== null;
  const bgValid = scene.backgroundColor === null || HEX_COLOR.test(scene.backgroundColor);

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        More options
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="mt-4 space-y-5">
          {backgroundAvailable && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Background colour</p>
              {bgOn ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a background colour"
                    disabled={disabled}
                    value={bgValid && scene.backgroundColor ? scene.backgroundColor : "#1f2937"}
                    onChange={(e) => onSettingsChange({ backgroundColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    aria-label="Background colour hex value"
                    disabled={disabled}
                    value={scene.backgroundColor ?? ""}
                    onChange={(e) => onSettingsChange({ backgroundColor: e.target.value })}
                    aria-invalid={!bgValid ? true : undefined}
                    className={hexInputClass}
                    maxLength={7}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onSettingsChange({ backgroundColor: null })}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Using the avatar&apos;s own background.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onSettingsChange({ backgroundColor: "#1f2937" })}
                  >
                    Set a colour
                  </Button>
                </div>
              )}
            </div>
          )}

          {motionAvailable && (
            <div className="space-y-1.5">
              <Label htmlFor="scene-motion-prompt">Motion and gestures (optional)</Label>
              <Textarea
                id="scene-motion-prompt"
                value={scene.motionPrompt ?? ""}
                maxLength={MOTION_PROMPT_MAX}
                disabled={disabled}
                onChange={(e) => onSettingsChange({ motionPrompt: e.target.value || null })}
                placeholder="e.g. gestures warmly while speaking, calm and steady"
                className="min-h-20"
              />
              <p className="text-xs text-muted-foreground">
                Describes how animated this scene looks. Only applies with the Avatar V engine, and hasn&apos;t
                been tried against a real avatar yet, so treat it as experimental.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Everything about the active scene: its type, title, who speaks, and the
// script or media. Settings for the whole video live in the right column.
export function SceneEditor({
  scene,
  number,
  totalScenes,
  defaults,
  avatars,
  engine,
  issues,
  disabled,
  showIssues,
  aspectRatio,
  selection,
  onChange,
  onSettingsChange,
  onSlideImageChange,
  userId,
  onBackgroundChange,
  onBackgroundAdjustChange,
}: {
  scene: SceneData;
  number: number;
  totalScenes: number;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  engine: VideoEngineValue;
  issues: SceneIssue[];
  disabled: boolean;
  showIssues: boolean;
  aspectRatio: string;
  selection: SceneSelection;
  onChange: (patch: SceneEdit) => void;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
  onSlideImageChange: (image: SlideImageData) => void;
  userId: string;
  onBackgroundChange: (media: BackgroundMediaRef | null) => void;
  onBackgroundAdjustChange: (adjust: BackgroundAdjust | null) => void;
}) {
  const resolved = resolveScene(scene, defaults);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  // Only show the "needs a script"/"needs a link" errors once the person has
  // had a chance to fill the scene in, or has tried to generate.
  const visibleErrors = showIssues ? errors : errors.filter((e) => e.code !== "EMPTY_SCRIPT" && e.code !== "NO_MEDIA");
  const kindHint = KIND_OPTIONS.find((o) => o.value === scene.kind)?.hint;
  const firstBlank = number === 1 && totalScenes === 1 && !scene.script.trim();

  return (
    <section aria-labelledby="scene-editor-heading">
      <Card>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="scene-editor-heading" className="text-base font-semibold">
                Scene {number} <span className="font-normal text-muted-foreground">of {totalScenes}</span>
              </h2>
              <KindSwitch value={scene.kind} disabled={disabled} onChange={(kind) => onChange({ kind })} />
            </div>
            <p className="text-xs text-muted-foreground">{kindHint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scene-title">
              Scene title <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="scene-title"
              value={scene.title}
              maxLength={SCENE_TITLE_MAX}
              disabled={disabled}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Welcome and introduction"
            />
          </div>

          {scene.kind === "AVATAR" ? (
            <>
              <SpeakerSection
                scene={scene}
                resolved={resolved}
                avatars={avatars}
                defaults={defaults}
                disabled={disabled}
                selection={selection}
                onSettingsChange={onSettingsChange}
              />

              <BackgroundPicker
                userId={userId}
                value={scene.backgroundMedia}
                supported={lookSupportsBackground(avatars, resolved.avatarId, resolved.avatarLookId)}
                disabled={disabled}
                appliesToCount={selection?.includesThisScene ? selection.count : undefined}
                onChange={onBackgroundChange}
                adjust={scene.backgroundAdjust}
                onAdjustChange={onBackgroundAdjustChange}
                cutoutUrl={effectiveLook(avatars, resolved.avatarId, resolved.avatarLookId)?.cutoutUrl ?? null}
              />

              {firstBlank && (
                <div className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    Start with your opening line. Each scene is one part of your video, so keep it short and natural.
                    Add more scenes from the list whenever you&apos;re ready.
                  </p>
                </div>
              )}

              <ScriptField
                scene={scene}
                engine={engine}
                disabled={disabled}
                label={`What should the avatar say in scene ${number}?`}
                placeholder="Write or paste the script for this scene."
                rows={12}
                className="min-h-56"
                showTips
                onChange={onChange}
              />

              <MoreOptions
                scene={scene}
                resolved={resolved}
                avatars={avatars}
                engine={engine}
                disabled={disabled}
                onSettingsChange={onSettingsChange}
              />
            </>
          ) : scene.kind === "SLIDE" ? (
            <SlideSceneContent
              scene={scene}
              resolved={resolved}
              defaults={defaults}
              avatars={avatars}
              engine={engine}
              disabled={disabled}
              aspectRatio={aspectRatio}
              selection={selection}
              onChange={onChange}
              onSettingsChange={onSettingsChange}
              onSlideImageChange={onSlideImageChange}
            />
          ) : (
            <MediaSceneContent
              scene={scene}
              resolved={resolved}
              defaults={defaults}
              avatars={avatars}
              engine={engine}
              disabled={disabled}
              aspectRatio={aspectRatio}
              selection={selection}
              onChange={onChange}
              onSettingsChange={onSettingsChange}
            />
          )}

          <IssueList errors={visibleErrors} warnings={warnings} />
        </CardContent>
      </Card>
    </section>
  );
}

// "16:9" -> "16 / 9" for the CSS aspect-ratio property.
function cssAspect(aspectRatio: string): string {
  const [w, h] = aspectRatio.split(":").map(Number);
  return w > 0 && h > 0 ? `${w} / ${h}` : "16 / 9";
}

// Slide + narration: the slide fills the frame (letterboxed in black exactly
// as generation does it, see lib/slides/images.ts) while the voice reads the
// script. The scene's avatar and look stay stored but hidden here.
function SlideSceneContent({
  scene,
  resolved,
  defaults,
  avatars,
  engine,
  disabled,
  aspectRatio,
  selection,
  onChange,
  onSettingsChange,
  onSlideImageChange,
}: {
  scene: SceneData;
  resolved: Resolved;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  engine: VideoEngineValue;
  disabled: boolean;
  aspectRatio: string;
  selection: SceneSelection;
  onChange: (patch: SceneEdit) => void;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
  onSlideImageChange: (image: SlideImageData) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatar = resolved.avatarId ? (avatars.find((a) => a.id === resolved.avatarId) ?? null) : null;
  const image = scene.slideImage;

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/dashboard/media/slide-image", { method: "POST", body: formData });
      const json = (await res.json().catch(() => ({}))) as Partial<SlideImageData> & { error?: string };
      if (!res.ok || !json.id || !json.url || !json.width || !json.height) {
        setError(json.error ?? "Couldn't upload that image. Please try again.");
        return;
      }
      onSlideImageChange({ id: json.id, url: json.url, width: json.width, height: json.height });
    } catch {
      setError("Couldn't upload that image. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Slide</p>
          {image && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
              Replace slide
            </Button>
          )}
        </div>
        <div
          className={cn(
            "relative flex w-full items-center justify-center overflow-hidden rounded-lg border",
            image ? "bg-black" : "bg-muted/60",
          )}
          style={{ aspectRatio: cssAspect(aspectRatio) }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL, same as the watermark preview
            <img
              src={image.url}
              alt={scene.sourcePageNumber ? `Slide from page ${scene.sourcePageNumber}` : "Slide"}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Presentation className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">
                {scene.sourcePageNumber ? `No image for page ${scene.sourcePageNumber}` : "No slide image yet"}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {scene.sourcePageNumber
                  ? "Slide images are deleted a day after your video is finished, to keep your documents private. Add the page again to make another video, or switch this scene to Avatar."
                  : "This scene can't be generated until it has one. Add an image, or switch it back to Avatar."}
              </p>
              <Button type="button" size="sm" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
                <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
                Add slide image
              </Button>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="sr-only">Uploading slide image</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {scene.sourcePageNumber ? `From page ${scene.sourcePageNumber} of your document. ` : ""}
          Shown in full, with black bars if its shape differs from the video&apos;s. PNG, JPEG or WebP, up to 10MB.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Upload a slide image"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      <ScriptField
        scene={scene}
        engine={engine}
        disabled={disabled}
        label="What should be said over this slide?"
        placeholder="Write the narration for this slide."
        rows={8}
        className="min-h-40"
        showTips
        onChange={onChange}
      />

      <div className="space-y-2">
        <SelectionNote selection={selection} fields="Voice" />
        <VoiceField
          scene={scene}
          resolved={resolved}
          defaults={defaults}
          avatars={avatars}
          disabled={disabled}
          // With no voice chosen, the scene's avatar's own voice narrates it.
          isAvatarScene={!!avatar}
          onSettingsChange={onSettingsChange}
        />
      </div>
    </>
  );
}

function MediaScenePreview({ kind, url }: { kind: "IMAGE" | "VIDEO"; url: string }) {
  // An arbitrary external link, so next/image can't be used (it only serves
  // pre-configured hostnames). A plain tag with a fallback on error instead.
  if (kind === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-full w-full object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <video controls muted preload="metadata" className="h-full w-full object-contain">
      <source src={url} />
    </video>
  );
}

function MediaSceneContent({
  scene,
  resolved,
  defaults,
  avatars,
  engine,
  disabled,
  aspectRatio,
  selection,
  onChange,
  onSettingsChange,
}: {
  scene: SceneData;
  resolved: Resolved;
  defaults: ProjectDefaults;
  avatars: AvatarOption[];
  engine: VideoEngineValue;
  disabled: boolean;
  aspectRatio: string;
  selection: SceneSelection;
  onChange: (patch: SceneEdit) => void;
  onSettingsChange: (patch: SceneSettingsPatch) => void;
}) {
  const kind = scene.kind as "IMAGE" | "VIDEO";
  const url = (scene.mediaUrl ?? "").trim();
  const narrated = scene.script.trim().length > 0;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="scene-media-url">{kind === "IMAGE" ? "Image link" : "Video link"}</Label>
        <Input
          id="scene-media-url"
          type="url"
          inputMode="url"
          value={scene.mediaUrl ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ mediaUrl: e.target.value })}
          placeholder={kind === "IMAGE" ? "https://example.com/your-image.png" : "https://example.com/your-clip.mp4"}
        />
        <p className="text-xs text-muted-foreground">
          A link to {kind === "IMAGE" ? "an image" : "a video"} that&apos;s already hosted somewhere. There&apos;s no
          upload here yet, so it needs its own web address.
        </p>
      </div>

      {url && kind === "IMAGE" && (
        <ImageCropPicker
          imageUrl={url}
          aspectRatio={aspectRatio}
          disabled={disabled}
          onCropped={(newUrl) => onChange({ mediaUrl: newUrl })}
        />
      )}

      {url && kind === "VIDEO" && (
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted">
          <MediaScenePreview kind={kind} url={url} />
        </div>
      )}

      <ScriptField
        scene={scene}
        engine={engine}
        disabled={disabled}
        label="Add narration (optional)"
        placeholder={
          kind === "IMAGE"
            ? "Leave blank for a silent title card, or write what should be said over it."
            : "Leave blank to play the clip at its own length and sound, or write what should be said over it."
        }
        rows={6}
        className="min-h-32"
        headerNote={
          !narrated && kind === "IMAGE" ? (
            <span className="text-xs text-muted-foreground">Or set a length below</span>
          ) : undefined
        }
        emptyNote="No narration, so this scene stays silent."
        extraNote={narrated && !resolved.voiceId ? "needs a voice, choose one below" : undefined}
        showTips={narrated}
        onChange={onChange}
      />

      {narrated && (
        <div className="space-y-2">
          <SelectionNote selection={selection} fields="Voice" />
          <VoiceField
            scene={scene}
            resolved={resolved}
            defaults={defaults}
            avatars={avatars}
            disabled={disabled}
            isAvatarScene={false}
            onSettingsChange={onSettingsChange}
          />
        </div>
      )}

      {kind === "IMAGE" && !narrated && (
        <div className="space-y-1.5">
          <Label htmlFor="scene-duration">How long should it show for?</Label>
          <div className="flex items-center gap-3">
            <input
              id="scene-duration"
              type="range"
              min={MIN_MEDIA_DURATION}
              max={MAX_MEDIA_DURATION}
              disabled={disabled}
              value={scene.mediaDurationSeconds ?? DEFAULT_MEDIA_DURATION}
              onChange={(e) => onChange({ mediaDurationSeconds: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {scene.mediaDurationSeconds ?? DEFAULT_MEDIA_DURATION}s
            </span>
          </div>
        </div>
      )}

      {kind === "VIDEO" && !narrated && (
        <p className="text-xs text-muted-foreground">
          Without narration, this clip plays at its own natural length and volume, so the total time estimate
          won&apos;t include it.
        </p>
      )}
    </>
  );
}
