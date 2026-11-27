"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Summary = { none: number; queued: number; rendering: number; ready: number; failed: number; notPossible: number };
type Settings = { backgroundsForClients: boolean; autoCutouts: boolean };

// Admin controls for custom backgrounds and cut-out previews: the launch
// switch, automatic cut-outs for new looks, the backfill button and live
// progress. Counts refresh every 20 s while cut-outs are being made.
export function BackgroundsAdminCard({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // State is only set in the promise callbacks, after the request returns.
  const load = useCallback(() => {
    return fetchState().then(
      (json) => {
        setSettings(json.settings);
        setSummary(json.cutouts);
      },
      () => setError("Couldn't load the background settings. Refresh to try again."),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    fetchState().then(
      (json) => {
        if (!alive) return;
        setSettings(json.settings);
        setSummary(json.cutouts);
      },
      () => alive && setError("Couldn't load the background settings. Refresh to try again."),
    );
    return () => {
      alive = false;
    };
  }, []);

  const working = !!summary && summary.queued + summary.rendering > 0;
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
  }, [working, load]);

  async function toggle(key: keyof Settings, value: boolean) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/backgrounds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSettings(((await res.json()) as { settings: Settings }).settings);
    } catch {
      setError("Couldn't save that change. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function queueAll() {
    setBusy("queue");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue-all" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { queued: number; cutouts: Summary };
      setSummary(json.cutouts);
      setNotice(
        json.queued === 0
          ? "Every ready look already has a cut-out or is in the queue."
          : `Queued ${json.queued} ${json.queued === 1 ? "look" : "looks"}. They're made about 10 at a time, every 10 minutes.`,
      );
    } catch {
      setError("Couldn't queue the looks. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!settings || !summary) {
    return error ? (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading
      </p>
    );
  }

  const missing = summary.none + summary.failed;

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-3">
        <Switch
          label="Backgrounds for clients"
          description={
            settings.backgroundsForClients
              ? "On: every client can use a photo or video background with looks marked as supported."
              : "Off: only admins see backgrounds, so you can try them on the live site first."
          }
          checked={settings.backgroundsForClients}
          disabled={!canManage || busy !== null}
          onChange={(v) => void toggle("backgroundsForClients", v)}
        />
        <Switch
          label="Make cut-outs for new looks automatically"
          description="When a look becomes ready, it's queued for a cut-out preview. Each costs about 2 to 5 cents."
          checked={settings.autoCutouts}
          disabled={!canManage || busy !== null}
          onChange={(v) => void toggle("autoCutouts", v)}
        />
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="font-medium">Cut-out previews (ready looks)</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <Count label="Ready" value={summary.ready} />
          <Count label="In the queue" value={summary.queued} />
          <Count label="Being made" value={summary.rendering} />
          <Count label="Not made yet" value={summary.none} />
          <Count label="Failed" value={summary.failed} />
          <Count label="Can't be cut out" value={summary.notPossible} />
        </dl>
        {working && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Making cut-outs. This updates every 20 seconds.
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" size="sm" variant="outline" disabled={busy !== null || missing === 0} onClick={() => void queueAll()}>
              {busy === "queue" ? "Queuing..." : `Queue all looks without a cut-out (${missing})`}
            </Button>
            {missing > 0 && (
              <span className="text-xs text-muted-foreground">
                About {formatCost(missing)} in total. Looks that can&apos;t be cut out cost nothing.
              </span>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

async function fetchState(): Promise<{ settings: Settings; cutouts: Summary }> {
  const res = await fetch("/api/admin/backgrounds", { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { settings: Settings; cutouts: Summary };
}

function formatCost(looks: number): string {
  const low = (looks * 0.02).toFixed(2);
  const high = (looks * 0.05).toFixed(2);
  return `US$${low} to US$${high}`;
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-muted transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-background before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[1.125rem] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      />
    </label>
  );
}
