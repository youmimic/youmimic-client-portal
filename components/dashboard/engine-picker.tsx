"use client";

import type { HeyGenEngine } from "@/lib/heygen";

// Cost figures are display-only copy, kept in sync by hand with
// lib/heygen/pricing.ts's ENGINE_RATE_USD_PER_SECOND — not imported
// directly since that file assumes the Prisma VideoEngine enum shape
// rather than HeyGen's lowercase API values this component works with.
const ENGINE_OPTIONS: {
  value: HeyGenEngine;
  label: string;
  description: string;
}[] = [
  { value: "avatar_iii", label: "Avatar III", description: "Lower cost — $0.0167/sec" },
  { value: "avatar_iv", label: "Avatar IV", description: "Balanced quality — $0.0667/sec" },
  {
    value: "avatar_v",
    label: "Avatar V",
    description: "Highest fidelity, most natural motion — $0.0667/sec",
  },
];

export function EnginePicker({
  value,
  onChange,
}: {
  value: HeyGenEngine;
  onChange: (value: HeyGenEngine) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Choose a rendering engine</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ENGINE_OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              className={`rounded-md border p-3 text-left transition-colors ${
                selected
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
