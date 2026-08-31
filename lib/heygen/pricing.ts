import type { VideoEngine } from "@/app/generated/prisma/enums";

// Per-second USD rates for Digital Twin avatars, which is what every avatar
// in this app currently is (confirmed via HeyGen's API — avatar_type:
// "digital_twin" on every avatar checked, supporting all three engines).
// Sourced from HeyGen's public API pricing docs
// (developers.heygen.com/docs/pricing) as of 2026-08-31 — HeyGen can change
// these without notice and doesn't expose them via the API itself, so this
// is a point-in-time reference, not a live-synced value. If pricing drifts,
// only new generations pick up an updated rate here — GeneratedVideo rows
// already store their own estimatedCostCents, so past estimates don't
// silently change underneath anyone.
export const ENGINE_RATE_USD_PER_SECOND: Record<VideoEngine, number> = {
  AVATAR_III: 0.0167,
  AVATAR_IV: 0.0667,
  AVATAR_V: 0.0667,
};

export function estimatedCostCents(
  engine: VideoEngine,
  durationSeconds: number,
): number {
  const usd = ENGINE_RATE_USD_PER_SECOND[engine] * durationSeconds;
  return Math.round(usd * 100);
}
