"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, TriangleAlert, Video } from "lucide-react";
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
import type { ProjectReadiness } from "@/lib/projects/rules";
import { formatCents, formatDuration } from "@/lib/video-display";

export type GenerateError =
  | { kind: "over_limit"; message: string }
  | { kind: "no_subscription"; message: string }
  | { kind: "not_ready"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "service"; message: string }
  | { kind: "network"; message: string };

// Readiness, estimate and the Generate button.
export function GenerationPanel({
  readiness,
  submitting,
  disabled,
  hasRender,
  error,
  onGenerate,
  onJump,
  onDismissError,
}: {
  readiness: ProjectReadiness;
  submitting: boolean;
  disabled: boolean;
  // A render already exists, so this generates a new one.
  hasRender: boolean;
  error: GenerateError | null;
  onGenerate: () => void;
  onJump: (sceneId: string) => void;
  onDismissError: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const blocking = readiness.issues.filter((i) => i.severity === "error");
  const warnings = readiness.issues.filter((i) => i.severity === "warning");

  function handleClick() {
    if (!readiness.canGenerate) {
      setShowIssues(true);
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review and generate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="flex items-start gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {readiness.canGenerate ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          )}
          <span>{readiness.summary}</span>
        </p>

        <dl className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
          <Row label="Scenes" value={String(readiness.sceneCount)} />
          <Row
            label="Estimated length"
            value={readiness.totalDurationSeconds > 0 ? formatDuration(readiness.totalDurationSeconds) : "0s"}
          />
          <Row label="Estimated credits" value={readiness.totalDurationSeconds > 0 ? `~${readiness.totalCredits.toFixed(1)}` : "0"} />
          <Row label="Estimated cost" value={readiness.totalDurationSeconds > 0 ? `~${formatCents(readiness.totalCostCents)}` : "$0.00"} />
          <Row
            label="Ready in"
            value={readiness.totalDurationSeconds > 0 ? `${readiness.waitMinutesLow} to ${readiness.waitMinutesHigh} min` : "-"}
          />
          <p className="pt-1 text-xs text-muted-foreground">
            Estimates come from your script length. The final figure follows the finished video&apos;s actual length.
          </p>
        </dl>

        {showIssues && !readiness.canGenerate && blocking.length > 0 && (
          <div role="alert" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="font-medium">
              {blocking.length === 1 ? "1 thing needs attention" : `${blocking.length} things need attention`}
            </p>
            <ul className="space-y-1">
              {blocking.map((issue) => (
                <li key={`${issue.sceneId}-${issue.code}`}>
                  <button
                    type="button"
                    onClick={() => onJump(issue.sceneId)}
                    className="rounded-sm text-left underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={`${w.sceneId}-${w.code}`}>
                <button type="button" onClick={() => onJump(w.sceneId)} className="text-left underline underline-offset-2 hover:no-underline">
                  {w.message}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
          >
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {error.kind === "over_limit" && <strong>You&apos;ve reached your video credit limit. </strong>}
                {error.kind === "no_subscription" && <strong>An active plan is needed to generate videos. </strong>}
                {error.kind === "service" && <strong>We couldn&apos;t start your video. </strong>}
                {error.message}
              </span>
            </p>
            <div className="flex gap-2">
              {(error.kind === "service" || error.kind === "network") && (
                <Button type="button" variant="outline" size="xs" onClick={() => setConfirmOpen(true)}>
                  Try again
                </Button>
              )}
              {(error.kind === "over_limit" || error.kind === "no_subscription") && (
                <Button asChild variant="outline" size="xs">
                  <Link href="/dashboard/billing">Go to billing</Link>
                </Button>
              )}
              <Button type="button" variant="ghost" size="xs" onClick={onDismissError}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={disabled || submitting}
          aria-disabled={!readiness.canGenerate ? true : undefined}
          onClick={handleClick}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Starting your video...
            </>
          ) : (
            <>
              <Video className="h-4 w-4" aria-hidden="true" />
              {hasRender ? "Generate again" : "Generate video"}
            </>
          )}
        </Button>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasRender ? "Generate this video again?" : "Generate your video?"}</DialogTitle>
            <DialogDescription>
              All {readiness.sceneCount} {readiness.sceneCount === 1 ? "scene is" : "scenes are"} made into one video
              of about {formatDuration(readiness.totalDurationSeconds)}. It will use about{" "}
              {readiness.totalCredits.toFixed(1)} credits (around {formatCents(readiness.totalCostCents)}) and usually
              takes {readiness.waitMinutesLow} to {readiness.waitMinutesHigh} minutes.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The video is made in one go, so scenes can&apos;t be redone one at a time. If you change a scene later, you
            generate the whole video again.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Not yet
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                onGenerate();
              }}
            >
              Generate video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
