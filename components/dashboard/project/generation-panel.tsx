"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Captions, Check, CheckCircle2, Lightbulb, Loader2, Stamp, TriangleAlert, Video, X } from "lucide-react";
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
import { ASPECT_RATIO_LABEL, ENGINE_LABEL, formatCents, formatDuration, type VideoEngineValue } from "@/lib/video-display";
import { cn } from "@/lib/utils";

// Keep in sync with SettingsPanel's own highlight targets.
export type SettingTarget = "title" | "format" | "resolution" | "engine" | "voice" | "captions" | "watermark";

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
  canViewCost,
  watermarkUrl,
  captionsEnabled,
  onJumpToSetting,
  title,
  aspectRatio,
  resolution,
  engine,
  voiceName,
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
  // Dollar figures only — the credits estimate below stays visible to
  // everyone, same as video-workspace.tsx's single-video estimate.
  canViewCost: boolean;
  // A project-level setting (not a scene issue, so it doesn't fit
  // readiness.issues' per-scene shape), checked here the same way: a
  // non-blocking warning, visible both before and at the moment of
  // generating — a finished video with no watermark is easy not to notice
  // until after it's already rendered.
  watermarkUrl: string | null;
  // Same non-blocking, project-level warning treatment as watermarkUrl
  // above — burned-in captions are easy to assume are on by default.
  captionsEnabled: boolean;
  // Scrolls to and highlights the named setting in SettingsPanel — see
  // project-workspace.tsx's jumpToSetting. There's no scene to select for
  // any of these, unlike onJump above.
  onJumpToSetting: (target: SettingTarget) => void;
  // Whole-project settings, shown as a plain summary below so what's about
  // to be generated is visible in one place rather than only discoverable
  // by opening the settings panel. Title lives in the page header, not
  // SettingsPanel like the rest — "jumping" to it just scrolls/focuses that
  // input directly (see project-workspace.tsx's jumpToSetting).
  title: string;
  aspectRatio: string;
  resolution: string | null;
  engine: VideoEngineValue;
  // The project default voice — a scene can still override its own, but
  // this is the project-level summary, not a per-scene one.
  voiceName: string | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const blocking = readiness.issues.filter((i) => i.severity === "error");
  const warnings = readiness.issues.filter((i) => i.severity === "warning");
  // Surfaced again, more prominently, inside the confirm dialog itself
  // (not just the quiet list above the button) — a script that still says
  // "[Name]" out loud in the finished video is an easy thing to miss until
  // it's too late to redo cheaply (see the dialog's own "can't be redone
  // one at a time" note below).
  const placeholderWarnings = warnings.filter((w) => w.code === "PLACEHOLDER_TEXT");
  const noWatermark = !watermarkUrl;
  const noCaptions = !captionsEnabled;

  function handleClick() {
    if (!readiness.canGenerate) {
      setShowIssues(true);
      return;
    }
    setConfirmOpen(true);
  }

  const hasLength = readiness.totalDurationSeconds > 0;
  const stats: { label: string; value: string }[] = [
    { label: "Length", value: hasLength ? formatDuration(readiness.totalDurationSeconds) : "0s" },
    { label: "Credits", value: hasLength ? `~${readiness.totalCredits.toFixed(1)}` : "0" },
    { label: "Ready in", value: hasLength ? `${readiness.waitMinutesLow}-${readiness.waitMinutesHigh} min` : "-" },
    { label: readiness.sceneCount === 1 ? "Scene" : "Scenes", value: String(readiness.sceneCount) },
  ];
  if (canViewCost) stats.push({ label: "Cost", value: hasLength ? `~${formatCents(readiness.totalCostCents)}` : "$0.00" });

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

        <div className="space-y-1.5">
          <dl className="grid grid-cols-2 gap-2 [&>div:last-child:nth-child(odd)]:col-span-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="text-base font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Estimated from your script length. The final figure follows the finished video&apos;s actual length.
            {readiness.hasMediaScenes && " Image and video scenes may add to the real cost, which isn't shown here."}
            {readiness.hasUnknownDuration && " A video clip's own length isn't included until it's made."}
          </p>
        </div>

        <ul className="divide-y rounded-lg border text-sm">
          <CheckRow
            icon={<Captions className="h-4 w-4" aria-hidden="true" />}
            label="Captions"
            on={!noCaptions}
            onText="On"
            offText="Off"
            actionText={noCaptions ? "Turn on" : "Change"}
            onAction={() => onJumpToSetting("captions")}
          />
          <CheckRow
            icon={<Stamp className="h-4 w-4" aria-hidden="true" />}
            label="Watermark"
            on={!noWatermark}
            onText="Added"
            offText="None"
            actionText={noWatermark ? "Add" : "Change"}
            onAction={() => onJumpToSetting("watermark")}
          />
        </ul>

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
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {warnings.length === 1 ? "1 suggestion" : `${warnings.length} suggestions`}
            </p>
            <ul className="space-y-1">
              {warnings.map((w) => (
                <li key={`${w.sceneId}-${w.code}`}>
                  <button
                    type="button"
                    onClick={() => onJump(w.sceneId)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>{w.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
              {readiness.totalCredits.toFixed(1)} credits{canViewCost && <> (around {formatCents(readiness.totalCostCents)})</>} and
              usually takes {readiness.waitMinutesLow} to {readiness.waitMinutesHigh} minutes.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The video is made in one go, so scenes can&apos;t be redone one at a time. If you change a scene later, you
            generate the whole video again.
          </p>

          <dl className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
            <Row
              label="Title"
              value={title.trim() || "Untitled video"}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("title");
              }}
            />
            <Row
              label="Format"
              value={ASPECT_RATIO_LABEL[aspectRatio] ?? aspectRatio}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("format");
              }}
            />
            <Row
              label="Resolution"
              value={resolution === "4k" ? "4K" : (resolution ?? "Standard")}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("resolution");
              }}
            />
            <Row
              label="Rendering engine"
              value={ENGINE_LABEL[engine]}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("engine");
              }}
            />
            <Row
              label="Voice"
              value={voiceName ?? "Each avatar's own voice"}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("voice");
              }}
            />
            <Row
              label="Captions"
              value={<TickOrDash on={!noCaptions} />}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("captions");
              }}
            />
            <Row
              label="Watermark"
              value={<TickOrDash on={!noWatermark} />}
              onClick={() => {
                setConfirmOpen(false);
                onJumpToSetting("watermark");
              }}
            />
          </dl>

          {placeholderWarnings.length > 0 && (
            <div
              role="alert"
              className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            >
              <p className="flex items-start gap-2 font-medium">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {placeholderWarnings.length === 1
                  ? "A script still has placeholder text"
                  : `${placeholderWarnings.length} scripts still have placeholder text`}
              </p>
              <ul className="space-y-1 pl-6">
                {placeholderWarnings.map((w) => (
                  <li key={`${w.sceneId}-${w.code}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmOpen(false);
                        onJump(w.sceneId);
                      }}
                      className="text-left underline underline-offset-2 hover:no-underline"
                    >
                      {w.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noWatermark && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onJumpToSetting("watermark");
                }}
                className="text-left underline underline-offset-2 hover:no-underline"
              >
                No watermark is set for this video. Add one in the project settings first if you want one.
              </button>
            </div>
          )}
          {noCaptions && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onJumpToSetting("captions");
                }}
                className="text-left underline underline-offset-2 hover:no-underline"
              >
                Captions are turned off for this video. Turn them on in the project settings first if you want them burned in.
              </button>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep editing
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

function Row({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "flex items-center justify-between gap-3 rounded-sm",
        onClick && "cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// One optional extra (captions, watermark) as a calm row: its state in words
// plus an icon, never colour alone, and a button to the setting.
function CheckRow({
  icon,
  label,
  on,
  onText,
  offText,
  actionText,
  onAction,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onText: string;
  offText: string;
  actionText: string;
  onAction: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-foreground">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            on ? "text-green-700 dark:text-green-400" : "text-muted-foreground",
          )}
        >
          {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
          {on ? onText : offText}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={onAction} aria-label={`${actionText} ${label.toLowerCase()}`}>
          {actionText}
        </Button>
      </span>
    </li>
  );
}

function TickOrDash({ on }: { on: boolean }) {
  return on ? (
    <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Yes" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground" aria-label="No" />
  );
}
