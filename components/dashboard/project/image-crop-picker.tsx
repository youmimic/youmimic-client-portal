"use client";

import { useRef, useState } from "react";
import { Crop, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mirrors lib/media/crop.ts's computeCropBox, but in on-screen fractional
// (0-1) terms for the overlay rectangle rather than source pixels — the
// backend recomputes the real crop from the same inputs (source
// dimensions, aspect ratio, focal point) once this is submitted, so this
// is purely a preview; it never has to produce pixel-identical math.
function cropBoxFraction(naturalWidth: number, naturalHeight: number, targetRatio: number) {
  const sourceRatio = naturalWidth / naturalHeight;
  if (sourceRatio > targetRatio) {
    const widthFraction = targetRatio / sourceRatio;
    return { widthFraction: Math.min(widthFraction, 1), heightFraction: 1 };
  }
  const heightFraction = sourceRatio / targetRatio;
  return { widthFraction: 1, heightFraction: Math.min(heightFraction, 1) };
}

// Lets a person verify exactly how a pasted image will be cropped before it
// ever reaches HeyGen (which only ever center-crops, with no focal-point
// control of its own) — drag to reposition, confirm to actually crop it
// server-side and re-host the result. See app/api/dashboard/media/crop-image.
export function ImageCropPicker({
  imageUrl,
  aspectRatio,
  disabled,
  onCropped,
}: {
  imageUrl: string;
  aspectRatio: string;
  disabled?: boolean;
  onCropped: (newUrl: string) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const targetRatio = (() => {
    const [w, h] = aspectRatio.split(":").map(Number);
    return w > 0 && h > 0 ? w / h : 16 / 9;
  })();

  const box = naturalSize ? cropBoxFraction(naturalSize.width, naturalSize.height, targetRatio) : null;
  // Same clamp as lib/media/crop.ts's computeCropBox, in fractional terms —
  // without this the overlay would just center-follow the cursor and
  // overflow past the image near an edge, misrepresenting what the server
  // will actually produce (it clamps the box to stay fully in frame,
  // keeping its size, rather than shrinking it).
  const clampedLeft = box ? Math.min(Math.max(focus.x - box.widthFraction / 2, 0), 1 - box.widthFraction) : 0;
  const clampedTop = box ? Math.min(Math.max(focus.y - box.heightFraction / 2, 0), 1 - box.heightFraction) : 0;

  function updateFocusFromPointer(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    setFocus({ x, y });
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateFocusFromPointer(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    updateFocusFromPointer(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    draggingRef.current = false;
  }

  async function handleConfirmCrop() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch("/api/dashboard/media/crop-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: imageUrl, aspectRatio, focusX: focus.x, focusY: focus.y }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? `Request failed (${res.status})`);
      setState({ loading: false, error: null });
      onCropped(json.url);
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Couldn't crop that image." });
    }
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border bg-muted touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
            external URL, not one of our own optimized assets */}
        <img
          src={imageUrl}
          alt="Scene image preview"
          className="block max-h-80 w-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          onError={() => setState({ loading: false, error: "Couldn't load that image to preview it." })}
          draggable={false}
        />
        {box && (
          <div
            className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              width: `${box.widthFraction * 100}%`,
              height: `${box.heightFraction * 100}%`,
              left: `${clampedLeft * 100}%`,
              top: `${clampedTop * 100}%`,
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Drag to choose what stays in frame when this is cropped to {aspectRatio}.
        </p>
        <Button type="button" size="sm" disabled={disabled || state.loading || !naturalSize} onClick={handleConfirmCrop}>
          {state.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Crop className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {state.loading ? "Cropping…" : "Crop to fit"}
        </Button>
      </div>

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
