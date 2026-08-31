"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ActionState = { loading: boolean; error: string | null };
const idle: ActionState = { loading: false, error: null };

export type GeneratedVideoData = {
  id: string;
  script: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<GeneratedVideoData["status"], string> = {
  PENDING: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Ready",
  FAILED: "Failed",
};

const STATUS_CLASS: Record<GeneratedVideoData["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Shared by the avatar Studio page (one avatar's own video history) and the
// consolidated /dashboard/videos page (every video across all of a user's
// avatars) — extracted so both stay in sync rather than drifting apart.
export function GeneratedVideoRow({
  video,
  avatar,
}: {
  video: GeneratedVideoData;
  // Only passed on the consolidated /dashboard/videos list, where a video's
  // source avatar isn't already implied by the page it's shown on (unlike
  // within a single avatar's own Studio page).
  avatar?: { id: string; name: string };
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(idle);

  async function handleCheckStatus() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/dashboard/videos/${video.id}/refresh`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const isPending = video.status === "PENDING" || video.status === "PROCESSING";

  return (
    <div className="py-3 border-t first:border-t-0 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          {avatar && (
            <Link
              href={`/dashboard/avatars/${avatar.id}/studio`}
              className="block text-xs font-medium text-primary hover:underline"
            >
              {avatar.name}
            </Link>
          )}
          <p className="text-sm line-clamp-2">{video.script}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[video.status]}`}
        >
          {STATUS_LABEL[video.status]}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{formatDate(video.createdAt)}</p>

      {video.status === "COMPLETED" && video.videoUrl && (
        <video controls className="w-full max-w-md rounded-md border" poster={video.thumbnailUrl ?? undefined}>
          <source src={video.videoUrl} type="video/mp4" />
        </video>
      )}

      {video.status === "FAILED" && video.errorMessage && (
        <p className="text-xs text-destructive">{video.errorMessage}</p>
      )}

      {isPending && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" disabled={state.loading} onClick={handleCheckStatus}>
            {state.loading ? "Checking…" : "Check status"}
          </Button>
          {state.error && <span className="text-xs text-destructive">{state.error}</span>}
        </div>
      )}
    </div>
  );
}
