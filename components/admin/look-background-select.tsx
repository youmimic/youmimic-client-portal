"use client";

import { useState } from "react";

const OPTIONS = [
  { value: "UNKNOWN", label: "Backgrounds: not checked" },
  { value: "SUPPORTED", label: "Backgrounds: supported" },
  { value: "UNSUPPORTED", label: "Backgrounds: not supported" },
] as const;
type Value = (typeof OPTIONS)[number]["value"];

// Admin control for AvatarLook.backgroundRemoval: whether customers are
// offered custom photo/video backgrounds with this look. Set it after a test
// render; the app also marks a look "not supported" if the provider rejects it.
export function LookBackgroundSelect({ lookId, lookName, initial }: { lookId: string; lookName: string; initial: string }) {
  const [value, setValue] = useState<Value>((OPTIONS.find((o) => o.value === initial)?.value ?? "UNKNOWN") as Value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: Value) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/avatar-looks/${lookId}/background-removal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setValue(previous);
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        aria-label={`Custom backgrounds for ${lookName}`}
        value={value}
        disabled={saving}
        onChange={(e) => void change(e.target.value as Value)}
        className="h-6 rounded border border-input bg-background px-1 text-xs text-foreground disabled:opacity-60 [color-scheme:light] dark:[color-scheme:dark]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
