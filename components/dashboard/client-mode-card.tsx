"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function ClientModeCard({ enabled }: { enabled: boolean }) {
  const { update } = useSession();
  const [checked, setChecked] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onCheckedChange(next: boolean) {
    setChecked(next);
    setSaving(true);
    setError("");

    const res = await fetch("/api/dashboard/settings/client-mode", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });

    if (!res.ok) {
      setChecked(!next);
      setError("Couldn't save that change. Please try again.");
      setSaving(false);
      return;
    }

    await update();
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Presentation</CardTitle>
        <CardDescription>
          Hides pricing and generation-time details so your dashboard looks exactly like what a
          customer sees — useful when presenting or pitching.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={checked} disabled={saving} onCheckedChange={(v) => onCheckedChange(v === true)} />
          <span>Client mode</span>
        </label>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
