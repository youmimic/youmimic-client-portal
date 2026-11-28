"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const LABEL: Record<string, string> = {
  NONE: "No cut-out yet",
  QUEUED: "Cut-out queued",
  RENDERING: "Cut-out being made",
  READY: "Cut-out ready",
  FAILED: "Cut-out failed",
  NOT_POSSIBLE: "Can't be cut out",
};

// A look's cut-out preview in the admin look list: a small thumbnail on a
// checkerboard (so transparency is visible), its status, and a button to
// make it (again). The cut-out cron picks queued looks up within ~10 minutes.
export function LookCutoutCell({
  lookId,
  lookName,
  status: initialStatus,
  url,
  lookReady,
}: {
  lookId: string;
  lookName: string;
  status: string;
  url: string | null;
  lookReady: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inProgress = status === "QUEUED" || status === "RENDERING";

  async function queue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/avatar-looks/${lookId}/cutout`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't queue it.");
      setStatus("QUEUED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't queue it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {status === "READY" && url && (
        <span
          className="relative inline-block h-6 w-[42px] overflow-hidden rounded ring-1 ring-foreground/10"
          style={{ backgroundImage: "repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%)", backgroundSize: "8px 8px" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Vercel Blob URL */}
          <img src={url} alt={`${lookName} cut-out`} className="h-full w-full object-cover" />
        </span>
      )}
      <span className="text-xs text-muted-foreground">{LABEL[status] ?? status}</span>
      {lookReady && !inProgress && status !== "NOT_POSSIBLE" && (
        <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => void queue()}>
          {status === "READY" || status === "FAILED" ? "Make again" : "Make cut-out"}
        </Button>
      )}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
