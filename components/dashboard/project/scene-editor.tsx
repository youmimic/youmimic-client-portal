"use client";

import { useRef } from "react";
import NextImage from "next/image";
import { Image as ImageIcon, Lightbulb, TriangleAlert, UserCircle2, Video as VideoIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InsertPauseButton } from "@/components/dashboard/video/insert-pause-button";
import {
  DEFAULT_MEDIA_DURATION,
  MAX_MEDIA_DURATION,
  MIN_MEDIA_DURATION,
  resolveScene,
  SCENE_SCRIPT_MAX,
  SCENE_TITLE_MAX,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
  type SceneIssue,
  type SceneKindValue,
} from "@/lib/projects/rules";
import { estimateGeneration, formatDuration, wordCount, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type SceneEdit = Partial<
  Pick<SceneData, "title" | "script" | "kind" | "mediaUrl" | "mediaDurationSeconds">
>;

const KIND_OPTIONS: { value: SceneKindValue; label: string; icon: typeof UserCircle2; hint: string }[] = [
  { value: "AVATAR", label: "Avatar", icon: UserCircle2, hint: "Your avatar speaks" },
  { value: "IMAGE", label: "Image", icon: ImageIcon, hint: "A title card or photo" },
  { value: "VIDEO", label: "Video clip", icon: VideoIcon, hint: "A clip you already have" },
];

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

// The main editing area for the active scene: what kind of scene it is,
// its title, and its content (an avatar's script, or an image/video link
// with optional narration).
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
  onChange,
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
  onChange: (patch: SceneEdit) => void;
}) {
  const resolved = resolveScene(scene, defaults);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  // Only show the "needs a script"/"needs a link" errors once the person has
  // had a chance to fill the scene in, or has tried to generate.
  const visibleErrors = showIssues ? errors : errors.filter((e) => e.code !== "EMPTY_SCRIPT" && e.code !== "NO_MEDIA");

  return (
    <section aria-label={`Scene ${number} editor`} className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium" id="scene-kind-label">
          Scene type
        </p>
        <div role="radiogroup" aria-labelledby="scene-kind-label" className="grid grid-cols-3 gap-2">
          {KIND_OPTIONS.map((opt) => {
            const selected = opt.value === scene.kind;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange({ kind: opt.value })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                  selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scene-title">Scene {number} title (optional)</Label>
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
        <AvatarSceneContent
          scene={scene}
          number={number}
          totalScenes={totalScenes}
          resolved={resolved}
          avatars={avatars}
          engine={engine}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <MediaSceneContent scene={scene} resolved={resolved} engine={engine} disabled={disabled} onChange={onChange} />
      )}

      <IssueList errors={visibleErrors} warnings={warnings} />
    </section>
  );
}

function AvatarSceneContent({
  scene,
  number,
  totalScenes,
  resolved,
  avatars,
  engine,
  disabled,
  onChange,
}: {
  scene: SceneData;
  number: number;
  totalScenes: number;
  resolved: ReturnType<typeof resolveScene>;
  avatars: AvatarOption[];
  engine: VideoEngineValue;
  disabled: boolean;
  onChange: (patch: SceneEdit) => void;
}) {
  const avatar = avatars.find((a) => a.id === resolved.avatarId) ?? null;
  const look = avatar?.looks.find((l) => l.id === resolved.avatarLookId) ?? avatar?.looks.find((l) => l.ready) ?? null;
  const words = wordCount(scene.script);
  const estimate = estimateGeneration(scene.script, engine);
  const overLimit = scene.script.length > SCENE_SCRIPT_MAX;
  const firstBlank = number === 1 && totalScenes === 1 && !scene.script.trim();
  const scriptRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {look?.previewUrl ? (
            <NextImage src={look.previewUrl} alt="" fill unoptimized className="object-cover" sizes="64px" />
          ) : (
            <UserCircle2 className="m-auto h-full w-8 text-muted-foreground/40" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{avatar ? avatar.name : "No avatar chosen"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {avatar ? (look ? `${look.name} look` : "Default look") : "Choose an avatar in the scene settings."}
          </p>
        </div>
      </div>

      {firstBlank && (
        <div className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Start with your opening line. Each scene is one part of your video, so keep it short and natural. Add
            more scenes from the list whenever you&apos;re ready.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="scene-script">What should the avatar say in scene {number}?</Label>
          <InsertPauseButton
            textareaRef={scriptRef}
            value={scene.script}
            disabled={disabled}
            onInsert={(next) => onChange({ script: next })}
          />
        </div>
        <Textarea
          id="scene-script"
          ref={scriptRef}
          value={scene.script}
          rows={12}
          disabled={disabled}
          onChange={(e) => onChange({ script: e.target.value })}
          aria-describedby="scene-script-help"
          placeholder="Write or paste the script for this scene."
          className="min-h-56"
        />
        <div id="scene-script-help" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {words} {words === 1 ? "word" : "words"}
            {words > 0 && <> · about {formatDuration(estimate.durationSeconds)} spoken</>}
          </span>
          <span className={cn(overLimit && "font-medium text-destructive")}>
            {scene.script.length.toLocaleString("en-AU")}/{SCENE_SCRIPT_MAX.toLocaleString("en-AU")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          A pause only works if the chosen voice supports it — look for the &quot;Pauses&quot; tag in the voice list.
        </p>
      </div>
    </>
  );
}

function MediaScenePreview({ kind, url }: { kind: "IMAGE" | "VIDEO"; url: string }) {
  // An arbitrary external link, so next/image can't be used (it only serves
  // pre-configured hostnames) — a plain tag with a fallback on error instead.
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
  engine,
  disabled,
  onChange,
}: {
  scene: SceneData;
  resolved: ReturnType<typeof resolveScene>;
  engine: VideoEngineValue;
  disabled: boolean;
  onChange: (patch: SceneEdit) => void;
}) {
  const kind = scene.kind as "IMAGE" | "VIDEO";
  const url = (scene.mediaUrl ?? "").trim();
  const narrated = scene.script.trim().length > 0;
  const words = wordCount(scene.script);
  const estimate = estimateGeneration(scene.script, engine);
  const overLimit = scene.script.length > SCENE_SCRIPT_MAX;
  const scriptRef = useRef<HTMLTextAreaElement | null>(null);

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

      {url && (
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted">
          <MediaScenePreview kind={kind} url={url} />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Label htmlFor="scene-script">Add narration (optional)</Label>
          <div className="flex items-center gap-2">
            {!narrated && kind === "IMAGE" && (
              <span className="text-xs text-muted-foreground">Or set a length below</span>
            )}
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
          rows={6}
          disabled={disabled}
          onChange={(e) => onChange({ script: e.target.value })}
          aria-describedby="scene-script-help"
          placeholder={
            kind === "IMAGE"
              ? "Leave blank for a silent title card, or write what should be said over it."
              : "Leave blank to play the clip at its own length and sound, or write what should be said over it."
          }
          className="min-h-32"
        />
        <div id="scene-script-help" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {words > 0 ? (
              <>
                {words} {words === 1 ? "word" : "words"} · about {formatDuration(estimate.durationSeconds)} spoken
                {!resolved.voiceId && " · needs a voice, set below"}
              </>
            ) : (
              "No narration — this scene stays silent."
            )}
          </span>
          <span className={cn(overLimit && "font-medium text-destructive")}>
            {scene.script.length.toLocaleString("en-AU")}/{SCENE_SCRIPT_MAX.toLocaleString("en-AU")}
          </span>
        </div>
        {narrated && (
          <p className="text-xs text-muted-foreground">
            A pause only works if the chosen voice supports it — look for the &quot;Pauses&quot; tag in the voice
            list.
          </p>
        )}
      </div>

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
