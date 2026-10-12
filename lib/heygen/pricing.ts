import type { VideoEngine } from "@/app/generated/prisma/enums";

// Per-second USD rates for Digital Twin avatars, which is what every avatar
// in this app currently is (confirmed via HeyGen's API — avatar_type:
// "digital_twin" on every avatar checked, supporting all three engines).
// HeyGen doesn't expose real billed cost via its API or publish exact rates,
// so these are derived from live measurement: isolated before/after checks
// against the account's actual pay-as-you-go portal balance, with nothing
// else generated in between (2026-10-12). AVATAR_III's rate replaces an
// earlier reference-doc figure (0.0167) that measurement showed was running
// about 40% high. AVATAR_IV/V are still the original 2026-08-31 doc
// reference (developers.heygen.com/docs/pricing) — not yet re-measured. If
// pricing drifts, only new generations pick up an updated rate here —
// GeneratedVideo rows already store their own estimatedCostCents, so past
// estimates don't silently change underneath anyone.
export const ENGINE_RATE_USD_PER_SECOND: Record<VideoEngine, number> = {
  AVATAR_III: 0.012,
  AVATAR_IV: 0.0667,
  AVATAR_V: 0.0667,
};

// 4K output is only documented as available for Avatar III on Digital
// Twin/Studio avatar looks (developers.heygen.com/reference/create-video) —
// Avatar IV/V aren't documented as supporting it, so no rate is defined for
// them here; callers should prevent that combination rather than silently
// fall back to the standard rate. Derived from a single clean isolated
// live sample (1.80s billed at $0.05, confirmed via the same before/after
// portal-balance method as the standard rate above) — about 2.3x the
// standard AVATAR_III rate. One sample is thin; revisit if more data comes
// in.
export const AVATAR_III_4K_RATE_USD_PER_SECOND = 0.0277;

export function estimatedCostCents(
  engine: VideoEngine,
  durationSeconds: number,
  resolution?: string | null,
): number {
  const rate =
    engine === "AVATAR_III" && resolution === "4k"
      ? AVATAR_III_4K_RATE_USD_PER_SECOND
      : ENGINE_RATE_USD_PER_SECOND[engine];
  const usd = rate * durationSeconds;
  return Math.round(usd * 100);
}
