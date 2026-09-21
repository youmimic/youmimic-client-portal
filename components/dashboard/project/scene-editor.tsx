"use client";

import Image from "next/image";
import { Lightbulb, TriangleAlert, UserCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  resolveScene,
  SCENE_SCRIPT_MAX,
  SCENE_TITLE_MAX,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
  type SceneIssue,
} from "@/lib/projects/rules";
import { estimateGeneration, formatDuration, wordCount, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type SceneEdit = Partial<Pick<SceneData, "title" | "script">>;

// The main editing area for the active scene: title, the avatar that will
// speak, and the script.
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
  const avatar = avatars.find((a) => a.id === resolved.avatarId) ?? null;
  const look = avatar?.looks.find((l) => l.id === resolved.avatarLookId) ?? avatar?.looks.find((l) => l.ready) ?? null;
  const words = wordCount(scene.script);
  const estimate = estimateGeneration(scene.script, engine);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const overLimit = scene.script.length > SCENE_SCRIPT_MAX;
  // Only show the "needs a script" error once the person has had a chance to
  // write something, or has tried to generate.
  const visibleErrors = showIssues ? errors : errors.filter((e) => e.code !== "EMPTY_SCRIPT");
  const firstBlank = number === 1 && totalScenes === 1 && !scene.script.trim();

  return (
    <section aria-label={`Scene ${number} editor`} className="space-y-5">
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

      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {look?.previewUrl ? (
            <Image src={look.previewUrl} alt="" fill unoptimized className="object-cover" sizes="64px" />
          ) : (
            <UserCircle2 className="m-auto h-full w-8 text-muted-foreground/40" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{avatar ? avatar.name : "No avatar chosen"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {avatar
              ? look
                ? `${look.name} look`
                : "Default look"
              : "Choose an avatar in the scene settings."}
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
        <Label htmlFor="scene-script">What should the avatar say in scene {number}?</Label>
        <Textarea
          id="scene-script"
          value={scene.script}
          rows={12}
          disabled={disabled}
          onChange={(e) => onChange({ script: e.target.value })}
          aria-invalid={visibleErrors.length > 0 ? true : undefined}
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
      </div>

      {(visibleErrors.length > 0 || warnings.length > 0) && (
        <ul className="space-y-2" aria-live="polite">
          {visibleErrors.map((issue) => (
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
      )}
    </section>
  );
}
