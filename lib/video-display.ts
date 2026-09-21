import type { VideoEngine } from "@/app/generated/prisma/enums";
import { estimateDurationSeconds } from "@/lib/heygen/duration-estimate";
import { creditsForDurationMilli } from "@/lib/heygen/credits";
import { estimatedCostCents } from "@/lib/heygen/pricing";

// Client-safe helpers shared by the video workspace, the video page and the
// videos list, so labels and estimates stay identical everywhere.

export type VideoStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type VideoEngineValue = "AVATAR_III" | "AVATAR_IV" | "AVATAR_V";

export const STATUS_LABEL: Record<VideoStatus, string> = {
  PENDING: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Ready",
  FAILED: "Failed",
};

export const ENGINE_LABEL: Record<VideoEngineValue, string> = {
  AVATAR_III: "Avatar III",
  AVATAR_IV: "Avatar IV",
  AVATAR_V: "Avatar V",
};

export const ASPECT_RATIO_LABEL: Record<string, string> = {
  "16:9": "Landscape 16:9",
  "9:16": "Vertical 9:16",
  "1:1": "Square 1:1",
  "4:5": "Portrait 4:5",
};

export function isInProgress(status: VideoStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function wordCount(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export type GenerationEstimate = {
  durationSeconds: number;
  credits: number;
  costCents: number;
  waitMinutesLow: number;
  waitMinutesHigh: number;
};

// Same inputs the server uses to reserve credits (see lib/usage/ledger.ts),
// so what the user sees before submitting matches what gets reserved. The
// wait range is a rough guide only: the provider gives no queue-time figure.
export function estimateGeneration(script: string, engine: VideoEngineValue): GenerationEstimate {
  const durationSeconds = estimateDurationSeconds(script);
  const minutes = durationSeconds / 60;
  return {
    durationSeconds,
    credits: creditsForDurationMilli(engine as VideoEngine, durationSeconds) / 1000,
    costCents: estimatedCostCents(engine as VideoEngine, durationSeconds),
    waitMinutesLow: Math.max(1, Math.ceil(minutes)),
    waitMinutesHigh: Math.max(3, Math.ceil(minutes * 4)),
  };
}

export function videoTitle(video: { title: string | null; script: string }): string {
  if (video.title) return video.title;
  const firstLine = video.script.trim().split("\n")[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || "Untitled video";
}
