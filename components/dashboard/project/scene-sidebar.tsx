"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thumb } from "@/components/dashboard/project/avatar-look-picker";
import {
  MAX_SCENES,
  resolveScene,
  sceneDurationSeconds,
  type AvatarOption,
  type ProjectDefaults,
  type SceneData,
  type SceneReadiness,
} from "@/lib/projects/rules";
import { formatDuration, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

const READINESS_LABEL: Record<SceneReadiness, string> = {
  draft: "Draft",
  needs_attention: "Needs attention",
  ready: "Ready",
};

// An image scene's link is an arbitrary external URL, so it can't go through
// next/image (which only serves pre-configured hostnames) — a plain tag with
// an icon fallback if it fails to load. A video scene shows an icon only:
// grabbing a frame from an arbitrary clip isn't worth the cost in a list.
function SceneMediaThumb({ kind, mediaUrl }: { kind: "IMAGE" | "VIDEO"; mediaUrl: string | null }) {
  if (kind === "VIDEO" || !mediaUrl) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-foreground/10">
        {kind === "VIDEO" ? (
          <VideoIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
        )}
      </span>
    );
  }
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10">
      <ImageIcon className="absolute h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt=""
        className="relative h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

// The scene list. Drag a scene by its handle to reorder it, or use the Move
// up and Move down buttons, which work from the keyboard and on touch screens.
export function SceneSidebar({
  scenes,
  activeSceneId,
  avatars,
  defaults,
  readiness,
  engine,
  disabled,
  busy,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onReorder,
}: {
  scenes: SceneData[];
  activeSceneId: string;
  avatars: AvatarOption[];
  defaults: ProjectDefaults;
  readiness: Record<string, SceneReadiness>;
  engine: VideoEngineValue;
  disabled: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const atLimit = scenes.length >= MAX_SCENES;

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = scenes.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    onReorder(next);
  }

  return (
    <nav aria-label="Scenes" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scenes</h2>
        <span className="text-xs text-muted-foreground">
          {scenes.length} of {MAX_SCENES}
        </span>
      </div>

      <ol className="space-y-1.5">
        {scenes.map((scene, index) => {
          const active = scene.id === activeSceneId;
          const status = readiness[scene.id] ?? "draft";
          const seconds = sceneDurationSeconds(scene, engine);
          const preview = scene.script.trim().replace(/\s+/g, " ");
          // What this scene shows, so scenes are easy to tell apart at a
          // glance: an avatar's look, an image, or a video clip.
          const resolved = resolveScene(scene, defaults);
          const avatar = scene.kind === "AVATAR" ? (avatars.find((a) => a.id === resolved.avatarId) ?? null) : null;
          const look =
            avatar?.looks.find((l) => l.id === resolved.avatarLookId) ??
            avatar?.looks.find((l) => l.ready) ??
            null;
          const thumbSrc = look?.previewUrl ?? avatar?.previewUrl ?? null;
          const who =
            scene.kind === "AVATAR"
              ? avatar
                ? look && avatar.looks.length > 1
                  ? `${avatar.name} · ${look.name}`
                  : avatar.name
                : "No avatar"
              : scene.kind === "IMAGE"
                ? scene.script.trim()
                  ? "Image, narrated"
                  : "Image"
                : scene.script.trim()
                  ? "Video, narrated"
                  : "Video";
          return (
            <li
              key={scene.id}
              draggable={!disabled && !busy}
              onDragStart={(e) => {
                setDragId(scene.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(scene.id);
              }}
              onDragLeave={() =>
                setOverId((cur) => (cur === scene.id ? null : cur))
              }
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(scene.id);
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "rounded-lg border bg-card transition-colors",
                active
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:border-primary/50",
                dragId === scene.id && "opacity-50",
                overId === scene.id &&
                  dragId !== scene.id &&
                  "border-dashed border-primary",
              )}
            >
              <div className="flex items-start gap-1 p-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 shrink-0 text-muted-foreground",
                    disabled ? "opacity-30" : "cursor-grab",
                  )}
                  title="Drag to reorder"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(scene.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {scene.kind === "AVATAR" ? (
                    <Thumb
                      src={thumbSrc}
                      alt={avatar ? `${who}` : ""}
                      className="h-12 w-12 rounded-md ring-1 ring-foreground/10"
                      iconClass="h-6 w-6"
                    />
                  ) : (
                    <SceneMediaThumb kind={scene.kind} mediaUrl={scene.mediaUrl} />
                  )}
                  <span className="block min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {index + 1}. {scene.title.trim() || "Untitled scene"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {seconds === null ? "—" : seconds > 0 ? formatDuration(seconds) : "0s"}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {preview ||
                        (scene.kind === "AVATAR"
                          ? "No script yet"
                          : scene.kind === "IMAGE"
                            ? "Silent title card"
                            : "Plays at its own length")}
                    </span>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
                        status === "ready" &&
                          "text-green-700 dark:text-green-400",
                        status === "needs_attention" &&
                          "text-amber-700 dark:text-amber-400",
                        status === "draft" && "text-muted-foreground",
                      )}
                    >
                      {status === "ready" ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      ) : status === "needs_attention" ? (
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      ) : null}
                      {READINESS_LABEL[status]}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {who}
                    </span>
                  </span>
                </button>
              </div>

              {active && (
                <div
                  role="group"
                  aria-label={`Actions for scene ${index + 1}`}
                  className="flex flex-wrap gap-1 border-t px-2 py-1.5"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move scene ${index + 1} up`}
                    disabled={disabled || busy || index === 0}
                    onClick={() => onMove(scene.id, -1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move scene ${index + 1} down`}
                    disabled={disabled || busy || index === scenes.length - 1}
                    onClick={() => onMove(scene.id, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Duplicate scene ${index + 1}`}
                    disabled={disabled || busy || atLimit}
                    onClick={() => onDuplicate(scene.id)}
                  >
                    <Copy />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    aria-label={`Delete scene ${index + 1}`}
                    disabled={disabled || busy || scenes.length <= 1}
                    title={
                      scenes.length <= 1
                        ? "A video needs at least one scene"
                        : undefined
                    }
                    onClick={() => onDelete(scene.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || busy || atLimit}
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add scene
      </Button>
      {atLimit && (
        <p className="text-xs text-muted-foreground">
          You have reached the limit of {MAX_SCENES} scenes.
        </p>
      )}
    </nav>
  );
}
