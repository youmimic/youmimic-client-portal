"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Clock, Loader2, Play, RotateCcw, TriangleAlert, UserCircle2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnginePicker } from "@/components/dashboard/engine-picker";
import { VoicePicker, type SelectedVoice } from "@/components/dashboard/video/voice-picker";
import type { HeyGenEngine } from "@/lib/heygen";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from "@/lib/validations/video";
import {
  ASPECT_RATIO_LABEL,
  ENGINE_LABEL,
  estimateGeneration,
  formatCents,
  formatDateTime,
  formatDuration,
  wordCount,
  type VideoEngineValue,
} from "@/lib/video-display";
import { cn } from "@/lib/utils";

const SCRIPT_MAX = 5000;
const TITLE_MAX = 120;

export type AvatarLookOption = {
  id: string;
  name: string;
  status: string;
  previewUrl: string | null;
  videoUrl: string | null;
};

// Values a workspace can start with, used by Duplicate (?from=<videoId>).
export type WorkspaceInitialValues = {
  title: string;
  script: string;
  lookId: string | null;
  engine: HeyGenEngine;
  aspectRatio: string;
  resolution: string | null;
  voice: SelectedVoice;
};

type Draft = {
  title: string;
  script: string;
  lookId: string | null;
  engine: HeyGenEngine;
  aspectRatio: string;
  resolution: string | null;
  voice: SelectedVoice;
  savedAt: number;
};

type SubmitError =
  | { kind: "over_limit"; message: string }
  | { kind: "no_subscription"; message: string }
  | { kind: "field"; message: string }
  | { kind: "service"; message: string }
  | { kind: "network"; message: string };

const draftKey = (avatarId: string) => `youmimic:video-draft:${avatarId}`;

function readDraft(avatarId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(avatarId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return typeof parsed.script === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(avatarId: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(avatarId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(avatarId));
  } catch {
    // Storage can be blocked (private windows). Drafts are a convenience only.
  }
}

function LookThumbnail({ previewUrl, name }: { previewUrl: string | null; name: string }) {
  if (previewUrl) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        <Image src={previewUrl} alt={name} fill unoptimized className="object-cover" sizes="120px" />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted">
      <UserCircle2 className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 4,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; hint?: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id={`seg-${label}`}>
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={`seg-${label}`}
        className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
              )}
            >
              {opt.icon}
              <span className="text-xs font-medium">{opt.label}</span>
              {opt.hint && <span className="text-[11px] text-muted-foreground">{opt.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RatioShape({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 22 / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="block rounded-[3px] border-2 border-current text-muted-foreground"
      style={{ width: `${w * scale + 4}px`, height: `${h * scale + 4}px` }}
    />
  );
}

export function VideoWorkspace({
  avatarId,
  avatarName,
  looks,
  initial,
  resetFrom,
}: {
  avatarId: string;
  avatarName: string;
  looks: AvatarLookOption[];
  initial?: WorkspaceInitialValues;
  // Shown when the form was prefilled from an earlier video.
  resetFrom?: string;
}) {
  const router = useRouter();
  const firstReadyLookId = looks.find((l) => l.status === "ready")?.id ?? null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [script, setScript] = useState(initial?.script ?? "");
  const [lookId, setLookId] = useState<string | null>(initial?.lookId ?? firstReadyLookId);
  // Defaults to Avatar III (the lower-cost option) rather than the provider's
  // own default of Avatar IV, matching lib/validations/video.ts.
  const [engine, setEngine] = useState<HeyGenEngine>(initial?.engine ?? "avatar_iii");
  const [aspectRatio, setAspectRatio] = useState<string>(initial?.aspectRatio ?? "16:9");
  const [resolution, setResolution] = useState<string | null>(initial?.resolution ?? null);
  const [voice, setVoice] = useState<SelectedVoice>(initial?.voice ?? null);
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(initial && (initial.resolution || initial.engine !== "avatar_iii")),
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [touched, setTouched] = useState(false);
  const [lookPreviewOpen, setLookPreviewOpen] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftHandled, setDraftHandled] = useState(false);

  // An unsent draft saved by an earlier visit. Read through
  // useSyncExternalStore so the server render (no localStorage) and the first
  // client render agree. The user chooses to restore or discard it, and
  // autosave stays paused until they do so it can never overwrite it.
  const rawDraft = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(draftKey(avatarId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const pendingDraft = useMemo<Draft | null>(() => {
    if (initial || draftHandled || !rawDraft) return null;
    const parsed = readDraft(avatarId);
    return parsed && parsed.script.trim() ? parsed : null;
  }, [rawDraft, initial, draftHandled, avatarId]);

  function restoreDraft() {
    if (!pendingDraft) return;
    const d = pendingDraft;
    setTitle(d.title ?? "");
    setScript(d.script);
    if (d.lookId && looks.some((l) => l.id === d.lookId && l.status === "ready")) setLookId(d.lookId);
    setEngine(d.engine ?? "avatar_iii");
    setAspectRatio(d.aspectRatio ?? "16:9");
    setResolution(d.resolution ?? null);
    setVoice(d.voice ?? null);
    setDraftHandled(true);
  }

  // Autosave, debounced, and paused while a saved draft is waiting for a
  // restore-or-discard decision.
  useEffect(() => {
    if (pendingDraft) return;
    const timer = window.setTimeout(() => {
      if (!script.trim() && !title.trim()) {
        writeDraft(avatarId, null);
        setDraftSavedAt(null);
        return;
      }
      const savedAt = Date.now();
      writeDraft(avatarId, { title, script, lookId, engine, aspectRatio, resolution, voice, savedAt });
      setDraftSavedAt(savedAt);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [avatarId, pendingDraft, title, script, lookId, engine, aspectRatio, resolution, voice]);

  const discardDraft = useCallback(() => {
    writeDraft(avatarId, null);
    setDraftSavedAt(null);
    setDraftHandled(true);
  }, [avatarId]);

  const estimate = useMemo(
    () => estimateGeneration(script, engine.toUpperCase() as VideoEngineValue),
    [script, engine],
  );
  const words = wordCount(script);

  const scriptError = touched && !script.trim() ? "Write a script so your avatar has something to say." : null;
  const lookError = looks.length > 0 && !lookId ? "Pick a ready look to continue." : null;
  const canSubmit = !submitting && script.trim().length > 0 && script.length <= SCRIPT_MAX && !lookError;

  async function submit() {
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/dashboard/avatars/${avatarId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          engine,
          aspectRatio,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(lookId ? { avatarLookId: lookId } : {}),
          ...(resolution ? { resolution } : {}),
          ...(voice ? { voiceId: voice.id, voiceName: voice.name } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        generatedVideoId?: string;
      };

      if (res.status === 201 && json.generatedVideoId) {
        writeDraft(avatarId, null);
        router.push(`/dashboard/videos/${json.generatedVideoId}?new=1`);
        return;
      }

      const message = json.error ?? `Request failed (${res.status})`;
      if (res.status === 402 || json.code === "OVER_LIMIT") setSubmitError({ kind: "over_limit", message });
      else if (res.status === 403) setSubmitError({ kind: "no_subscription", message });
      else if (res.status === 422) setSubmitError({ kind: "field", message });
      else setSubmitError({ kind: "service", message });
      setSubmitting(false);
    } catch {
      setSubmitError({
        kind: "network",
        message: "We couldn't reach the server. Check your connection and try again.",
      });
      setSubmitting(false);
    }
  }

  const selectedLook = looks.find((l) => l.id === lookId) ?? null;

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-6">
        {resetFrom && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Started from an earlier video. Change anything you like, then generate a new one.
          </p>
        )}
        {pendingDraft && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              You have an unsent draft from {formatDateTime(new Date(pendingDraft.savedAt).toISOString())}.
            </span>
            <span className="flex gap-2">
              <Button type="button" size="sm" onClick={restoreDraft}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore draft
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
                Discard
              </Button>
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Script</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="video-title">Title (optional)</Label>
              <Input
                id="video-title"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Welcome message from ${avatarName}`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="video-script">What should {avatarName} say?</Label>
              <Textarea
                id="video-script"
                value={script}
                rows={9}
                maxLength={SCRIPT_MAX}
                onChange={(e) => setScript(e.target.value)}
                onBlur={() => setTouched(true)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
                aria-invalid={scriptError ? true : undefined}
                aria-describedby="script-help"
                placeholder="Write or paste your script here. Short, natural sentences work best."
              />
              <div id="script-help" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span aria-live="polite">
                  {words} {words === 1 ? "word" : "words"}
                  {words > 0 && <> · about {formatDuration(estimate.durationSeconds)} spoken</>}
                </span>
                <span className={cn(script.length > SCRIPT_MAX * 0.95 && "text-destructive")}>
                  {script.length}/{SCRIPT_MAX}
                </span>
              </div>
              {scriptError && (
                <p role="alert" className="text-sm text-destructive">
                  {scriptError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Tip: press Ctrl+Enter (or Cmd+Enter) to generate.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Look, voice and format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {looks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium" id="look-label">
                  Look
                </p>
                <div role="group" aria-labelledby="look-label" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {looks.map((look) => {
                    const ready = look.status === "ready";
                    const selected = look.id === lookId;
                    return (
                      <button
                        key={look.id}
                        type="button"
                        disabled={!ready}
                        aria-pressed={selected}
                        onClick={() => {
                          setLookId(look.id);
                          setLookPreviewOpen(false);
                        }}
                        className={cn(
                          "space-y-1 rounded-md border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
                          selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                        )}
                      >
                        <LookThumbnail previewUrl={look.previewUrl} name={look.name} />
                        <p className="truncate px-0.5 text-[11px] text-muted-foreground">
                          {ready ? look.name : `${look.name} (not ready)`}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {lookError && touched && <p className="text-sm text-destructive">{lookError}</p>}
                {selectedLook?.videoUrl &&
                  (lookPreviewOpen ? (
                    <div className="space-y-2">
                      <video
                        key={selectedLook.id}
                        controls
                        autoPlay
                        playsInline
                        poster={selectedLook.previewUrl ?? undefined}
                        aria-label={`${selectedLook.name} intro clip`}
                        className="w-full max-w-xs rounded-md border"
                      >
                        <source src={selectedLook.videoUrl} type="video/mp4" />
                      </video>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLookPreviewOpen(false)}>
                        Hide preview
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setLookPreviewOpen(true)}>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Watch {selectedLook.name} intro
                    </Button>
                  ))}
              </div>
            )}

            <VoicePicker value={voice} onChange={setVoice} />

            <Segmented
              label="Format"
              value={aspectRatio}
              onChange={setAspectRatio}
              options={VIDEO_ASPECT_RATIOS.map((r) => ({
                value: r,
                label: ASPECT_RATIO_LABEL[r].split(" ")[0],
                hint: r,
                icon: <RatioShape ratio={r} />,
              }))}
            />

            <div>
              <button
                type="button"
                aria-expanded={advancedOpen}
                aria-controls="advanced-settings"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
                Advanced settings
              </button>
              {advancedOpen && (
                <div id="advanced-settings" className="mt-4 space-y-6">
                  <Segmented
                    label="Resolution"
                    columns={3}
                    value={resolution ?? "default"}
                    onChange={(v) => setResolution(v === "default" ? null : v)}
                    options={[
                      { value: "default", label: "Standard", hint: "Provider default" },
                      ...VIDEO_RESOLUTIONS.map((r) => ({ value: r, label: r })),
                    ]}
                  />
                  <EnginePicker value={engine} onChange={setEngine} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Review and generate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <ReviewRow label="Avatar" value={selectedLook ? `${avatarName} · ${selectedLook.name}` : avatarName} />
              <ReviewRow label="Title" value={title.trim() || "Untitled"} />
              <ReviewRow label="Voice" value={voice ? voice.name : "Avatar's own voice"} />
              <ReviewRow label="Format" value={ASPECT_RATIO_LABEL[aspectRatio] ?? aspectRatio} />
              <ReviewRow label="Resolution" value={resolution ?? "Standard"} />
              <ReviewRow label="Engine" value={ENGINE_LABEL[engine.toUpperCase() as VideoEngineValue]} />
            </dl>

            <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated credits</span>
                <span className="font-medium">
                  {words > 0 ? `~${estimate.credits.toFixed(1)}` : "0"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated cost</span>
                <span className="font-medium">{words > 0 ? `~${formatCents(estimate.costCents)}` : "$0.00"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ready in</span>
                <span className="font-medium">
                  {words > 0 ? `${estimate.waitMinutesLow} to ${estimate.waitMinutesHigh} min` : "-"}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Estimates are based on your script length. The final figure follows the finished video&apos;s
                actual length, and the wait is a rough guide only.
              </p>
            </div>

            {submitError && <SubmitErrorBanner error={submitError} onRetry={() => void submit()} />}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || (touched && !canSubmit)}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Starting your video...
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" aria-hidden="true" />
                  Generate video
                </>
              )}
            </Button>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {draftSavedAt
                ? "Draft saved in this browser."
                : "Your script is saved as a draft in this browser as you type."}
            </p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function SubmitErrorBanner({ error, onRetry }: { error: SubmitError; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400"
    >
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {error.kind === "over_limit" && (
            <>
              <strong>You&apos;ve reached your video credit limit.</strong> {error.message}
            </>
          )}
          {error.kind === "no_subscription" && (
            <>
              <strong>An active plan is needed to generate videos.</strong> {error.message}
            </>
          )}
          {error.kind === "field" && <>Please check your details: {error.message}</>}
          {error.kind === "service" && (
            <>
              <strong>We couldn&apos;t start your video.</strong> {error.message}
            </>
          )}
          {error.kind === "network" && error.message}
        </span>
      </p>
      <div className="flex gap-2">
        {(error.kind === "service" || error.kind === "network") && (
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            Try again
          </Button>
        )}
        {(error.kind === "over_limit" || error.kind === "no_subscription") && (
          <Button asChild variant="outline" size="xs">
            <Link href="/dashboard/billing">Go to billing</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
