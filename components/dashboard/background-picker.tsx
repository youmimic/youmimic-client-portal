"use client";

import { useEffect, useId, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImageUp, Loader2, TriangleAlert, Video as VideoIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BackgroundMediaRef } from "@/lib/projects/rules";
import { DEFAULT_ADJUST, isDefaultAdjust, svgColourMatrixValues, type BackgroundAdjust } from "@/lib/backgrounds/adjust";
import { cn } from "@/lib/utils";

// Same limits the server enforces (lib/backgrounds/media.ts), checked here
// first so a wrong file fails instantly instead of after uploading.
const LIMITS = {
  IMAGE: { accept: "image/jpeg,image/png,image/webp", types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 20 * 1024 * 1024, hint: "JPG, PNG or WebP, up to 20 MB" },
  VIDEO: { accept: "video/mp4", types: ["video/mp4"], maxBytes: 50 * 1024 * 1024, hint: "MP4, up to 50 MB" },
} as const;
type Kind = keyof typeof LIMITS;

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

// A photo or video shown behind the avatar, who is cut out of the backdrop
// they were filmed against. The file goes straight from the browser to
// storage (it can be too large to pass through our server), then is
// registered and checked by the server before it can be used.
export function BackgroundPicker({
  userId,
  value,
  supported,
  disabled,
  appliesToCount,
  onChange,
  adjust,
  onAdjustChange,
  cutoutUrl,
}: {
  userId: string;
  value: BackgroundMediaRef | null;
  // Whether the chosen look can be cut out. Unsupported with nothing set
  // renders nothing; unsupported with a background set shows a warning.
  supported: boolean;
  disabled?: boolean;
  // When several scenes are ticked, the change goes to all of them.
  appliesToCount?: number;
  onChange: (media: BackgroundMediaRef | null) => void;
  // Photo adjustments (darken, warmth, colour, blur). Without onAdjustChange
  // no adjustment controls are shown.
  adjust?: BackgroundAdjust | null;
  onAdjustChange?: (adjust: BackgroundAdjust | null) => void;
  // The chosen look's cut-out (transparent PNG). When set, it's layered
  // over the background so the preview shows the avatar in front of it, as
  // the video will. The adjustments only change the background layer.
  cutoutUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [pendingKind, setPendingKind] = useState<Kind>("IMAGE");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const headingId = useId();
  const filterId = useId().replace(/:/g, "");
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const uploading = progress !== null;
  const current = adjust ?? DEFAULT_ADJUST;
  const showAdjust = !!onAdjustChange && !!value;
  // The same filter the server bakes in, on the photo or the playing video.
  const previewFilter =
    showAdjust && !isDefaultAdjust(current)
      ? { filter: `url(#${filterId}) blur(${((current.blur / 1000) * previewWidth).toFixed(2)}px)` }
      : undefined;

  // The preview blur is scaled to the preview width, the same rule the
  // server uses at full size (lib/backgrounds/adjust.ts blurSigma).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  if (!supported && !value) return null;

  function pick(kind: Kind) {
    setError(null);
    setPendingKind(kind);
    // Set before click so the picker filters to the right kind.
    if (inputRef.current) inputRef.current.accept = LIMITS[kind].accept;
    inputRef.current?.click();
  }

  async function start(file: File) {
    const kind: Kind | null = (LIMITS.IMAGE.types as readonly string[]).includes(file.type)
      ? "IMAGE"
      : (LIMITS.VIDEO.types as readonly string[]).includes(file.type)
        ? "VIDEO"
        : null;
    if (!kind) {
      setError(pendingKind === "VIDEO" ? "Use an MP4 video." : "Use a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > LIMITS[kind].maxBytes) {
      setError(`That file is too large (${LIMITS[kind].hint}).`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress(0);
    try {
      const blob = await upload(`backgrounds/${userId}/background.${EXTENSION[file.type]}`, file, {
        access: "public",
        handleUploadUrl: "/api/dashboard/media/background/upload",
        contentType: file.type,
        multipart: file.size > 8 * 1024 * 1024,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      const res = await fetch("/api/dashboard/media/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<BackgroundMediaRef> & { error?: string };
      if (!res.ok || !json.id || !json.url || !json.kind) {
        setError(json.error ?? "Couldn't save that file. Please try again.");
        return;
      }
      onChange({ id: json.id, kind: json.kind, url: json.url });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "";
      setError(
        /too many/i.test(message)
          ? "Too many uploads. Please try again later."
          : "The upload didn't finish. Check your connection and try again.",
      );
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2" role="group" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={headingId} className="text-sm font-medium">
          Background
        </p>
        {appliesToCount && appliesToCount > 1 ? (
          <p className="text-xs text-muted-foreground">Changes apply to the {appliesToCount} ticked scenes</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border">
        {/* The preview only appears once a photo or video is chosen; with the
            original background the picker stays a compact row. */}
        {value && (
          <div ref={previewRef} className="relative aspect-video w-full overflow-hidden bg-muted/60">
            {value.kind === "VIDEO" ? (
              <video
                key={value.url}
                src={value.url}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                autoPlay={!reduceMotion}
                controls={reduceMotion}
                aria-label="Background video preview"
                style={previewFilter}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL, same as slide previews
              <img
                src={value.url}
                alt="Background photo preview"
                className="h-full w-full object-cover"
                style={previewFilter}
              />
            )}
            {cutoutUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL
              <img
                src={cutoutUrl}
                alt="The avatar in front of this background"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
            )}
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80" role="status">
                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <p className="text-sm">Uploading {progress}%</p>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              </div>
            )}
            {!uploading && (
              <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
                {value.kind === "VIDEO" ? "Video" : "Photo"}
              </span>
            )}
          </div>
        )}

        <div className="space-y-3 p-3">
          {!value && (
            <p className="text-xs text-muted-foreground">Original: the background the avatar was filmed with.</p>
          )}
          {!value && uploading && (
            <div className="flex flex-wrap items-center gap-2" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-sm">Uploading {progress}%</span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            </div>
          )}
          {!supported && value ? (
            <div role="alert" className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>This look can&apos;t be shown on a custom background. Use the original background, or choose a different look.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {supported && (
              <>
                <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => pick("IMAGE")}>
                  <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {value?.kind === "IMAGE" ? "Replace photo" : "Use a photo"}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => pick("VIDEO")}>
                  <VideoIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {value?.kind === "VIDEO" ? "Replace video" : "Use a video"}
                </Button>
              </>
            )}
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled || uploading} onClick={() => onChange(null)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Use original
              </Button>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          {showAdjust && supported && (
            <AdjustControls value={current} disabled={disabled || uploading} onChange={(next) => onAdjustChange?.(isDefaultAdjust(next) ? null : next)} />
          )}
          {showAdjust && supported && value?.kind === "VIDEO" && !isDefaultAdjust(current) && (
            <p className="text-xs text-muted-foreground">
              An adjusted video takes a little longer to prepare when you generate (usually under a minute).
            </p>
          )}

          {supported && value && (
            <p className={cn("text-xs text-muted-foreground")}>
              Photos: {LIMITS.IMAGE.hint}. Videos: {LIMITS.VIDEO.hint}; they play silently on a loop. Anything that was in
              front of or around the avatar when they were filmed, like a desk or chair, may stay in the picture.
            </p>
          )}
        </div>
      </div>

      {/* Same colour matrix the server applies (sRGB, like sharp's recomb). */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={svgColourMatrixValues(current)} />
        </filter>
      </svg>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void start(file);
        }}
      />
    </div>
  );
}

const SLIDERS: { key: keyof BackgroundAdjust; label: string; min: number; max: number; step: number; format: (v: number) => string }[] = [
  { key: "darken", label: "Darken", min: 0, max: 70, step: 1, format: (v) => `${v}%` },
  { key: "warmth", label: "Warmth", min: -100, max: 100, step: 1, format: (v) => (v === 0 ? "Neutral" : v > 0 ? `Warmer ${v}` : `Cooler ${-v}`) },
  { key: "saturation", label: "Colour", min: 0, max: 150, step: 1, format: (v) => `${v}%` },
  { key: "blur", label: "Blur", min: 0, max: 10, step: 0.5, format: (v) => (v === 0 ? "Off" : String(v)) },
];

// Sliders for the photo adjustments. Changes show live in the preview; the
// adjusted copy is made when the video is generated, and the original photo
// is never changed.
function AdjustControls({
  value,
  disabled,
  onChange,
}: {
  value: BackgroundAdjust;
  disabled?: boolean;
  onChange: (next: BackgroundAdjust) => void;
}) {
  const baseId = useId();
  return (
    <fieldset className="space-y-2.5 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium">Adjust the background</legend>
      {SLIDERS.map((s) => (
        <div key={s.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2">
          <label htmlFor={`${baseId}-${s.key}`} className="text-xs">
            {s.label}
          </label>
          <input
            id={`${baseId}-${s.key}`}
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={value[s.key]}
            disabled={disabled}
            aria-valuetext={s.format(value[s.key])}
            onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <span className="text-right text-xs tabular-nums text-muted-foreground">{s.format(value[s.key])}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">A little darken and blur often helps the avatar stand out.</p>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || isDefaultAdjust(value)} onClick={() => onChange(DEFAULT_ADJUST)}>
          Reset
        </Button>
      </div>
    </fieldset>
  );
}
