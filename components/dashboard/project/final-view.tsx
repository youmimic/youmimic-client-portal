"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, Loader2, Pencil, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectView } from "@/lib/projects/service";
import {
  ASPECT_RATIO_LABEL,
  estimateGeneration,
  formatCents,
  formatDateTime,
  formatDuration,
  type VideoEngineValue,
} from "@/lib/video-display";
import { cn } from "@/lib/utils";

function useElapsed(since: string, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

// What the person sees once a render has been requested: progress while the
// video is being made, the player when it is done, or the reason it failed.
// The scene strip comes from the scenes as they were when the video was made,
// so editing the project afterwards doesn't change what this shows.
export function FinalView({
  project,
  checking,
  pollError,
  busy,
  onCheckNow,
  onEdit,
  onEditScene,
  onDuplicate,
  onDelete,
  onRefreshLink,
}: {
  project: ProjectView;
  checking: boolean;
  pollError: string | null;
  busy: boolean;
  onCheckNow: () => void;
  onEdit: () => void;
  onEditScene: (sceneNumber: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRefreshLink: () => void;
}) {
  const video = project.finalVideo;
  const generating = project.status === "GENERATING";
  const elapsed = useElapsed(video?.createdAt ?? new Date().toISOString(), generating);
  // HeyGen's video link is signed and expires after about a week. Rather
  // than refreshing every video's link up front, this only refreshes when
  // the player actually fails to load — once, so a genuinely offline
  // connection doesn't retry forever. Declared before the early return below
  // so this hook always runs, keeping hook order stable across renders.
  const autoHealed = useRef(false);
  if (!video) return null;

  const snapshot = video.sceneSnapshot ?? [];
  const estimate = estimateGeneration(snapshot.map((s) => s.script).join("\n"), project.engine as VideoEngineValue);
  const vertical = project.aspectRatio === "9:16" || project.aspectRatio === "4:5";

  function handlePlaybackError() {
    if (autoHealed.current || busy) return;
    autoHealed.current = true;
    onRefreshLink();
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-center bg-black/90">
          {project.status === "COMPLETED" && video.videoUrl ? (
            <video
              key={video.videoUrl}
              controls
              playsInline
              preload="metadata"
              poster={video.thumbnailUrl ?? undefined}
              onError={handlePlaybackError}
              className={vertical ? "max-h-[70vh] w-auto max-w-full" : "aspect-video w-full"}
            >
              <source src={video.videoUrl} type="video/mp4" />
            </video>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
              {generating && (
                <>
                  <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <div role="status" aria-live="polite">
                    <p className="font-medium">Your video is being made</p>
                    <p className="text-sm text-white/70">
                      {formatDuration(elapsed)} so far. Usually ready in {estimate.waitMinutesLow} to{" "}
                      {estimate.waitMinutesHigh} minutes.
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      All {snapshot.length} {snapshot.length === 1 ? "scene is" : "scenes are"} being put together in one
                      go. Your script and settings are saved.
                    </p>
                  </div>
                  <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
                    <div className="h-full w-1/3 animate-[video-progress_1.6s_ease-in-out_infinite] rounded-full bg-primary" />
                  </div>
                </>
              )}
              {project.status === "FAILED" && (
                <>
                  <TriangleAlert className="h-8 w-8 text-red-400" aria-hidden="true" />
                  <div role="alert">
                    <p className="font-medium">This video didn&apos;t finish</p>
                    <p className="max-w-md text-sm text-white/70">
                      {video.errorMessage ?? "Something went wrong while making it."} Your scenes are still saved. Check
                      them, then generate again.
                    </p>
                  </div>
                </>
              )}
              {project.status === "COMPLETED" && !video.videoUrl && (
                <>
                  <TriangleAlert className="h-8 w-8 text-yellow-300" aria-hidden="true" />
                  <p className="text-sm">The video link has expired. Refresh it to watch again.</p>
                </>
              )}
            </div>
          )}
        </div>
      </Card>

      {generating && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Button type="button" variant="outline" size="sm" disabled={checking} onClick={onCheckNow}>
            {checking ? "Checking..." : "Check progress now"}
          </Button>
          <span aria-live="polite">
            {pollError ? `Couldn't check progress just now: ${pollError}. We'll keep trying.` : "This page updates by itself."}
          </span>
        </div>
      )}

      {project.status === "COMPLETED" && project.isOutdated && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Out of date. You changed your scenes after this video was made. Edit the project and generate again to include
            the latest changes.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {project.status === "COMPLETED" && video.videoUrl && (
          <Button asChild>
            <a href={video.videoUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" aria-hidden="true" />
              Download
            </a>
          </Button>
        )}
        {!generating && (
          <Button type="button" variant={project.status === "FAILED" ? "default" : "outline"} onClick={onEdit}>
            {project.status === "FAILED" ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
            {project.status === "FAILED" ? "Edit and try again" : "Edit project"}
          </Button>
        )}
        {project.status === "COMPLETED" && (
          <Button type="button" variant="outline" disabled={busy} onClick={onRefreshLink}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh link
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy || generating} onClick={onDuplicate}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Duplicate project
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive sm:ml-auto"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Scenes in this video ({snapshot.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {snapshot.map((scene) => {
                const kindLabel = scene.kind === "AVATAR" ? scene.avatarName : scene.kind === "IMAGE" ? "Image" : "Video clip";
                return (
                  <li key={scene.order} className="flex items-start justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {scene.kind !== "AVATAR" && scene.mediaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scene.mediaUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {scene.order}. {scene.title.trim() || "Untitled scene"}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {scene.script || (scene.kind === "AVATAR" ? "" : "No narration")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[kindLabel, scene.voiceName].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    {!generating && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onEditScene(scene.order)}>
                        Edit scene
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2 text-base")}>
              {project.status === "COMPLETED" && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />}
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Detail label="Created" value={formatDateTime(video.createdAt)} />
              {video.completedAt && <Detail label="Finished" value={formatDateTime(video.completedAt)} />}
              <Detail label="Format" value={ASPECT_RATIO_LABEL[project.aspectRatio] ?? project.aspectRatio} />
              <Detail label="Resolution" value={project.resolution ?? "Standard"} />
              {video.durationSeconds != null && <Detail label="Length" value={formatDuration(video.durationSeconds)} />}
              {video.estimatedCostCents != null && (
                <Detail label="Estimated cost" value={`~${formatCents(video.estimatedCostCents)}`} />
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
