"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VideoStatusBadge } from "@/components/dashboard/video/video-status-badge";
import {
  ASPECT_RATIO_LABEL,
  ENGINE_LABEL,
  estimateGeneration,
  formatCents,
  formatDateTime,
  formatDuration,
  isInProgress,
  type VideoEngineValue,
  type VideoStatus,
} from "@/lib/video-display";

export type VideoDetailData = {
  id: string;
  avatarId: string;
  avatarName: string;
  title: string;
  script: string;
  status: VideoStatus;
  engine: VideoEngineValue;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  estimatedCostCents: number | null;
  aspectRatio: string | null;
  resolution: string | null;
  voiceId: string | null;
  voiceName: string | null;
  avatarLookId: string | null;
};

export type RelatedVideo = {
  id: string;
  title: string;
  status: VideoStatus;
  createdAt: string;
};

const ENGINE_API: Record<VideoEngineValue, string> = {
  AVATAR_III: "avatar_iii",
  AVATAR_IV: "avatar_iv",
  AVATAR_V: "avatar_v",
};

// Poll gently: every 6 seconds for the first two minutes, then every 15.
// Paused while the tab is hidden so a forgotten tab doesn't keep calling.
function useStatusPolling(video: VideoDetailData, onChange: () => void) {
  const [pollError, setPollError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const inProgress = isInProgress(video.status);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/videos/${video.id}/refresh`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { status?: VideoStatus; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setPollError(null);
      setCheckedAt(Date.now());
      if (json.status && json.status !== video.status) onChange();
    } catch (e) {
      setPollError(e instanceof Error ? e.message : "Could not check progress.");
    }
  }, [video.id, video.status, onChange]);

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

  return { pollError, checkedAt, checkNow: check };
}

function useElapsed(since: string, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

type Busy = null | "refresh-url" | "regenerate" | "delete";

export function VideoDetail({
  video,
  related,
  justCreated,
}: {
  video: VideoDetailData;
  related: RelatedVideo[];
  justCreated: boolean;
}) {
  const router = useRouter();
  const inProgress = isInProgress(video.status);
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const onChange = useCallback(() => router.refresh(), [router]);
  const { pollError, checkedAt, checkNow } = useStatusPolling(video, onChange);
  const elapsed = useElapsed(video.createdAt, inProgress);

  const estimate = estimateGeneration(video.script, video.engine);
  const studioHref = `/dashboard/avatars/${video.avatarId}/studio?from=${video.id}`;

  async function refreshUrl() {
    setBusy("refresh-url");
    setActionError(null);
    try {
      const res = await fetch(`/api/dashboard/videos/${video.id}/refresh-url`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not refresh the video link.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regenerate");
    setActionError(null);
    try {
      const res = await fetch(`/api/dashboard/avatars/${video.avatarId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: video.script,
          engine: ENGINE_API[video.engine],
          ...(video.title ? { title: video.title } : {}),
          ...(video.aspectRatio ? { aspectRatio: video.aspectRatio } : {}),
          ...(video.resolution ? { resolution: video.resolution } : {}),
          ...(video.voiceId ? { voiceId: video.voiceId, voiceName: video.voiceName ?? undefined } : {}),
          ...(video.avatarLookId ? { avatarLookId: video.avatarLookId } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; generatedVideoId?: string };
      if (res.status === 201 && json.generatedVideoId) {
        setRegenOpen(false);
        router.push(`/dashboard/videos/${json.generatedVideoId}?new=1`);
        return;
      }
      setRegenOpen(false);
      setActionError(
        res.status === 402
          ? `You've reached your video credit limit. ${json.error ?? ""}`.trim()
          : (json.error ?? `Request failed (${res.status})`),
      );
    } catch {
      setRegenOpen(false);
      setActionError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setActionError(null);
    try {
      const res = await fetch(`/api/dashboard/videos/${video.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      router.push(`/dashboard/videos?deleted=${json.warning ? "partial" : "1"}`);
    } catch (e) {
      setDeleteOpen(false);
      setActionError(e instanceof Error ? e.message : "Could not delete the video.");
      setBusy(null);
    }
  }

  async function manualCheck() {
    setChecking(true);
    await checkNow();
    setChecking(false);
  }

  const isVertical = video.aspectRatio === "9:16" || video.aspectRatio === "4:5";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {justCreated && inProgress && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Your video is on its way. You can leave this page and come back, it will keep going.
          </p>
        )}

        {/* Preview area */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-center bg-black/90">
            {video.status === "COMPLETED" && video.videoUrl ? (
              <video
                key={video.videoUrl}
                controls
                playsInline
                preload="metadata"
                poster={video.thumbnailUrl ?? undefined}
                className={isVertical ? "max-h-[70vh] w-auto max-w-full" : "aspect-video w-full"}
              >
                <source src={video.videoUrl} type="video/mp4" />
              </video>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                {inProgress && (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                    <div role="status" aria-live="polite">
                      <p className="font-medium">
                        {video.status === "PENDING" ? "Waiting in the queue" : "Creating your video"}
                      </p>
                      <p className="text-sm text-white/70">
                        {formatDuration(elapsed)} so far. Usually ready in {estimate.waitMinutesLow} to{" "}
                        {estimate.waitMinutesHigh} minutes.
                      </p>
                    </div>
                    <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
                      <div className="h-full w-1/3 animate-[video-progress_1.6s_ease-in-out_infinite] rounded-full bg-primary" />
                    </div>
                  </>
                )}
                {video.status === "FAILED" && (
                  <>
                    <TriangleAlert className="h-8 w-8 text-red-400" aria-hidden="true" />
                    <div>
                      <p className="font-medium">This video didn&apos;t finish</p>
                      <p className="max-w-md text-sm text-white/70">
                        {video.errorMessage ?? "Something went wrong while creating it."}
                      </p>
                    </div>
                  </>
                )}
                {video.status === "COMPLETED" && !video.videoUrl && (
                  <>
                    <TriangleAlert className="h-8 w-8 text-yellow-300" aria-hidden="true" />
                    <p className="text-sm">The video link has expired. Refresh it to watch again.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {inProgress && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Button type="button" variant="outline" size="sm" onClick={manualCheck} disabled={checking}>
              {checking ? "Checking..." : "Check progress now"}
            </Button>
            <span aria-live="polite">
              {pollError
                ? `Couldn't check progress just now: ${pollError}. We'll keep trying.`
                : checkedAt
                  ? "Checked a moment ago. This page updates by itself."
                  : "This page updates by itself."}
            </span>
          </div>
        )}

        {actionError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{actionError}</span>
            {actionError.toLowerCase().includes("credit") && (
              <Link href="/dashboard/billing" className="shrink-0 font-medium underline">
                Billing
              </Link>
            )}
          </p>
        )}

        {/* Contextual actions */}
        <div className="flex flex-wrap gap-2">
          {video.status === "COMPLETED" && video.videoUrl && (
            <Button asChild>
              <a href={video.videoUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download
              </a>
            </Button>
          )}
          {video.status === "FAILED" && (
            <Button type="button" onClick={() => setRegenOpen(true)} disabled={busy !== null}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          )}
          {video.status === "COMPLETED" && (
            <Button type="button" variant="outline" onClick={() => setRegenOpen(true)} disabled={busy !== null}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Regenerate
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={studioHref}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {video.status === "FAILED" ? "Edit script" : "Duplicate and edit"}
            </Link>
          </Button>
          {video.status === "COMPLETED" && (
            <Button type="button" variant="outline" onClick={refreshUrl} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 ${busy === "refresh-url" ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh link
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive sm:ml-auto"
            onClick={() => setDeleteOpen(true)}
            disabled={busy !== null}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {inProgress ? "Cancel and delete" : "Delete"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{video.script}</p>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Details
              <VideoStatusBadge status={video.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <DetailRow label="Avatar" value={video.avatarName} />
              <DetailRow label="Created" value={formatDateTime(video.createdAt)} />
              {video.completedAt && <DetailRow label="Finished" value={formatDateTime(video.completedAt)} />}
              <DetailRow label="Format" value={video.aspectRatio ? (ASPECT_RATIO_LABEL[video.aspectRatio] ?? video.aspectRatio) : "Standard"} />
              <DetailRow label="Resolution" value={video.resolution ?? "Standard"} />
              <DetailRow label="Voice" value={video.voiceName ?? "Avatar's own voice"} />
              <DetailRow label="Engine" value={ENGINE_LABEL[video.engine]} />
              {video.durationSeconds != null && <DetailRow label="Length" value={formatDuration(video.durationSeconds)} />}
              {video.estimatedCostCents != null && (
                <DetailRow label="Estimated cost" value={`~${formatCents(video.estimatedCostCents)}`} />
              )}
            </dl>
          </CardContent>
        </Card>

        {related.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Other versions of this script</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/videos/${r.id}`}
                  className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                  </span>
                  <VideoStatusBadge status={r.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </aside>

      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{video.status === "FAILED" ? "Try this video again?" : "Regenerate this video?"}</DialogTitle>
            <DialogDescription>
              This creates a new video from the same script and settings. Your current video stays as it is. It will use
              about {estimate.credits.toFixed(1)} credits (around {formatCents(estimate.costCents)}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRegenOpen(false)} disabled={busy === "regenerate"}>
              Not now
            </Button>
            <Button type="button" onClick={regenerate} disabled={busy === "regenerate"}>
              {busy === "regenerate" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Starting...
                </>
              ) : (
                "Generate again"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inProgress ? "Cancel and delete this video?" : "Delete this video?"}</DialogTitle>
            <DialogDescription>
              {inProgress
                ? "This stops tracking the video and removes it from your portal. Credits held for it are given back."
                : "This removes the video from your portal and from our video service. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy === "delete"}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={busy === "delete"}>
              {busy === "delete" ? "Deleting..." : "Delete video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
