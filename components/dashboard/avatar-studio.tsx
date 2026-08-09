"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SCRIPT_MAX = 5000;

type ActionState = { loading: boolean; error: string | null };
const idle: ActionState = { loading: false, error: null };

export type GeneratedVideoRow = {
  id: string;
  script: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<GeneratedVideoRow["status"], string> = {
  PENDING: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Ready",
  FAILED: "Failed",
};

const STATUS_CLASS: Record<GeneratedVideoRow["status"], string> = {
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

function VideoRow({ video }: { video: GeneratedVideoRow }) {
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
        <p className="text-sm line-clamp-2 flex-1">{video.script}</p>
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

export function AvatarStudio({
  avatarId,
  videos,
}: {
  avatarId: string;
  videos: GeneratedVideoRow[];
}) {
  const router = useRouter();
  const [script, setScript] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  async function handleGenerate() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/dashboard/avatars/${avatarId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setScript("");
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Write what you want the avatar to say…"
            rows={6}
            maxLength={SCRIPT_MAX}
          />
          <p className="text-xs text-muted-foreground text-right">
            {script.length}/{SCRIPT_MAX}
          </p>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button disabled={state.loading || script.trim().length === 0} onClick={handleGenerate}>
            {state.loading ? "Starting…" : "Generate video"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your videos</CardTitle>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos generated yet.</p>
          ) : (
            videos.map((v) => <VideoRow key={v.id} video={v} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
