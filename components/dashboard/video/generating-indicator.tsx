import type { ReactNode } from "react";
import NextImage from "next/image";
import { formatDuration } from "@/lib/video-display";

// The animated mark itself, reused both by the full-page GeneratingIndicator
// below and by the compact video/project cards (video-library.tsx,
// project-card.tsx) for their PROCESSING/GENERATING thumbnail state. The
// brand mark is split into its two shapes (public/loaders/mark-piece-{1,2}.png)
// and pulsed out of phase with each other via CSS — see the mark-pulse-a/b
// keyframes in app/globals.css. No video asset: a baked-background video loop
// here looked like a rendering bug against the dark backdrop, and a
// transparent two-layer PNG animation sidesteps that entirely.
export function MarkPulseLoader({ className }: { className?: string }) {
  return (
    <div className={className ?? "relative h-28 w-28"} aria-hidden="true">
      <NextImage
        src="/loaders/mark-piece-1.png"
        alt=""
        fill
        className="object-contain animate-[mark-pulse-a_1.4s_ease-in-out_infinite]"
      />
      <NextImage
        src="/loaders/mark-piece-2.png"
        alt=""
        fill
        className="object-contain animate-[mark-pulse-b_1.4s_ease-in-out_infinite]"
      />
    </div>
  );
}

// Shown while a video is generating (both the project flow's final-view.tsx
// and the single-video flow's video-detail.tsx).
export function GeneratingIndicator({
  label,
  sublabel,
  elapsedSeconds,
  waitMinutesLow,
  waitMinutesHigh,
  canViewTime,
}: {
  label: string;
  sublabel?: ReactNode;
  elapsedSeconds: number;
  waitMinutesLow: number;
  waitMinutesHigh: number;
  canViewTime: boolean;
}) {
  return (
    <>
      <MarkPulseLoader />
      <div role="status" aria-live="polite">
        <p className="font-medium">{label}</p>
        {canViewTime && (
          <p className="text-sm text-white/70">
            {formatDuration(elapsedSeconds)} so far. Usually ready in {waitMinutesLow} to {waitMinutesHigh} minutes.
          </p>
        )}
        {sublabel}
      </div>
    </>
  );
}
