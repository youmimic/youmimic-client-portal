"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoStatusBadge } from "@/components/dashboard/video/video-status-badge";
import { MarkPulseLoader } from "@/components/dashboard/video/generating-indicator";
import {
  ASPECT_RATIO_LABEL,
  ENGINE_LABEL,
  formatCents,
  formatDateTime,
  formatDuration,
  isInProgress,
  type VideoEngineValue,
  type VideoStatus,
} from "@/lib/video-display";
import { cn } from "@/lib/utils";

export type LibraryVideo = {
  id: string;
  title: string;
  status: VideoStatus;
  engine: VideoEngineValue;
  thumbnailUrl: string | null;
  createdAt: string;
  durationSeconds: number | null;
  estimatedCostCents: number | null;
  aspectRatio: string | null;
  errorMessage: string | null;
  avatarName: string;
  // Set when this video was rendered from a multi-scene project.
  projectId: string | null;
};

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "FAILED";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "In progress" },
  { value: "COMPLETED", label: "Ready" },
  { value: "FAILED", label: "Failed" },
];

// One video (or multi-scene project render) as a thumbnail card. Shared by the
// Videos page and the dashboard home so both look the same.
// A HeyGen thumbnail link is signed and expires after about a week. Rather
// than pre-emptively refreshing every video's link on every page load (slow,
// and redundant with the daily cron in vercel.json), each card heals itself:
// if the browser can't load the image, it asks the server for a fresh link
// once, and swaps it in. Only completed videos have a stable link worth
// refreshing this way.
function SelfHealingThumb({
  videoId,
  status,
  thumbnailUrl,
}: {
  videoId: string;
  status: VideoStatus;
  thumbnailUrl: string | null;
}) {
  const [src, setSrc] = useState(thumbnailUrl);
  const [broken, setBroken] = useState(false);
  const attempted = useRef(false);

  function handleError() {
    if (attempted.current || status !== "COMPLETED") {
      setBroken(true);
      return;
    }
    attempted.current = true;
    fetch(`/api/dashboard/videos/${videoId}/refresh-url`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { thumbnailUrl?: string | null } | null) => {
        if (json?.thumbnailUrl) setSrc(json.thumbnailUrl);
        else setBroken(true);
      })
      .catch(() => setBroken(true));
  }

  if ((status === "PENDING" || status === "PROCESSING") && (!src || broken)) {
    return <MarkPulseLoader className="relative h-12 w-12" />;
  }

  if (!src || broken) {
    return <Video className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />;
  }

  return (
    <Image
      key={src}
      src={src}
      alt=""
      fill
      unoptimized
      className="object-cover"
      sizes="(min-width: 1024px) 33vw, 50vw"
      onError={handleError}
    />
  );
}

// Poll gently while a card is in progress: every 6 seconds for the first two
// minutes, then every 15 — same cadence as the single-video detail page
// (video-detail.tsx's useStatusPolling). Paused while the tab is hidden.
// Without this, a video queued from this list (rather than its own detail
// page) never updates on its own — the list is otherwise a static server
// render that only gets fresh data on the next full page load.
function useCardStatusPolling(id: string, status: VideoStatus, onChange: () => void) {
  const startedAt = useRef<number | null>(null);
  const inProgress = status === "PENDING" || status === "PROCESSING";

  const check = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/videos/${id}/refresh`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { status?: VideoStatus };
      if (res.ok && json.status && json.status !== status) onChange();
    } catch {
      // Best-effort — the next tick, or the next full page load, will catch up.
    }
  }, [id, status, onChange]);

  useEffect(() => {
    if (!inProgress) return;
    startedAt.current ??= Date.now();
    let timer: number | undefined;
    const tick = () => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      timer = window.setTimeout(async () => {
        if (document.visibilityState === "visible") await check();
        tick();
      }, elapsed < 120_000 ? 6000 : 15000);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [inProgress, check]);
}

export function VideoCard({ v, canViewCost }: { v: LibraryVideo; canViewCost: boolean }) {
  const router = useRouter();
  const onChange = useCallback(() => router.refresh(), [router]);
  useCardStatusPolling(v.id, v.status, onChange);

  return (
    // Always this specific render's own id, even for a project video — every
    // past render for the same project previously shared one href (the
    // project page), which only ever shows the latest, so three cards for
    // three different renders all opened the exact same (newest) video. The
    // per-id page itself decides whether to redirect into the live project
    // editor (only for the project's current render) or show this specific
    // historical one — see app/(dashboard)/dashboard/videos/[id]/page.tsx.
    <Link
      href={`/dashboard/videos/${v.id}`}
      className="group block overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative flex aspect-video items-center justify-center bg-muted">
        <SelfHealingThumb videoId={v.id} status={v.status} thumbnailUrl={v.thumbnailUrl} />
        <VideoStatusBadge
          status={v.status}
          className="absolute left-2 top-2 shadow-sm"
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium group-hover:text-primary">
          {v.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {v.projectId ? "Multi-scene · " : ""}
          {v.avatarName} · {formatDateTime(v.createdAt)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {ENGINE_LABEL[v.engine]}
          {v.aspectRatio &&
            ` · ${ASPECT_RATIO_LABEL[v.aspectRatio]?.split(" ")[0] ?? v.aspectRatio}`}
          {v.durationSeconds != null &&
            ` · ${formatDuration(v.durationSeconds)}`}
          {canViewCost && v.estimatedCostCents != null &&
            ` · ~${formatCents(v.estimatedCostCents)}`}
        </p>
        {v.status === "FAILED" && v.errorMessage && (
          <p className="line-clamp-2 text-xs text-destructive">
            {v.errorMessage}
          </p>
        )}
      </div>
    </Link>
  );
}

export function VideoLibrary({ videos, canViewCost }: { videos: LibraryVideo[]; canViewCost: boolean }) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(
    () => ({
      ALL: videos.length,
      ACTIVE: videos.filter((v) => isInProgress(v.status)).length,
      COMPLETED: videos.filter((v) => v.status === "COMPLETED").length,
      FAILED: videos.filter((v) => v.status === "FAILED").length,
    }),
    [videos],
  );

  const visible = videos.filter((v) =>
    filter === "ALL"
      ? true
      : filter === "ACTIVE"
        ? isInProgress(v.status)
        : v.status === filter,
  );

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Filter videos by status"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              filter === f.value
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {f.label} <span className="text-xs">({counts[f.value]})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <Film
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              No videos match this filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter("ALL")}
            >
              Show all videos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v) => (
            <li key={v.id}>
              <VideoCard v={v} canViewCost={canViewCost} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
