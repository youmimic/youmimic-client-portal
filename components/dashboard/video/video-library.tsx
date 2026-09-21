"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Film, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoStatusBadge } from "@/components/dashboard/video/video-status-badge";
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

export function VideoLibrary({ videos }: { videos: LibraryVideo[] }) {
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
    filter === "ALL" ? true : filter === "ACTIVE" ? isInProgress(v.status) : v.status === filter,
  );

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter videos by status" className="flex flex-wrap gap-2">
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
            <Film className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No videos match this filter.</p>
            <Button variant="outline" size="sm" onClick={() => setFilter("ALL")}>
              Show all videos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v) => (
            <li key={v.id}>
              <Link
                href={v.projectId ? `/dashboard/videos/projects/${v.projectId}` : `/dashboard/videos/${v.id}`}
                className="group block overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="relative flex aspect-video items-center justify-center bg-muted">
                  {v.thumbnailUrl ? (
                    <Image
                      src={v.thumbnailUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(min-width: 1024px) 33vw, 50vw"
                    />
                  ) : (
                    <Video className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
                  )}
                  <VideoStatusBadge status={v.status} className="absolute left-2 top-2 shadow-sm" />
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium group-hover:text-primary">{v.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.projectId ? "Multi-scene · " : ""}
                    {v.avatarName} · {formatDateTime(v.createdAt)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ENGINE_LABEL[v.engine]}
                    {v.aspectRatio && ` · ${ASPECT_RATIO_LABEL[v.aspectRatio]?.split(" ")[0] ?? v.aspectRatio}`}
                    {v.durationSeconds != null && ` · ${formatDuration(v.durationSeconds)}`}
                    {v.estimatedCostCents != null && ` · ~${formatCents(v.estimatedCostCents)}`}
                  </p>
                  {v.status === "FAILED" && v.errorMessage && (
                    <p className="line-clamp-2 text-xs text-destructive">{v.errorMessage}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
