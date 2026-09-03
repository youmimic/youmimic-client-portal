// Estimates a script's spoken duration before HeyGen has ever rendered it —
// needed because HeyGen's create-video call doesn't return a duration
// estimate, only the final `duration` field once a job COMPLETES (see
// lib/heygen.ts's HeyGenVideoStatus). Credit reservation at generate-time
// needs *some* number to reserve against a limit before that.
//
// PLACEHOLDER: 150 words/minute is a commonly-cited average conversational
// speaking rate, not measured against this app's actual avatars/voices —
// treat it as a rough approximation. Once real UsageLedgerEntry rows
// accumulate estimatedDurationSeconds vs actualDurationSeconds pairs, this
// constant can be tuned against real data.
const WORDS_PER_MINUTE = 150;

export function estimateDurationSeconds(script: string): number {
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;
  return (wordCount / WORDS_PER_MINUTE) * 60;
}
