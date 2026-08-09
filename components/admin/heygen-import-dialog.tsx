"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Plan = {
  totalHeyGenAvatars: number;
  toCreate: unknown[];
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
  skipped: unknown[];
  skippedSummary: {
    alreadyLinked: number;
    noWorkspaceCode: number;
    unknownWorkspaceCode: Record<string, number>;
  };
};

type Result = {
  created: number;
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
};

type Step = "idle" | "loading" | "previewed" | "importing" | "done";

async function apiCall(dryRun: boolean) {
  const res = await fetch("/api/admin/avatars/heygen-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function HeyGenImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("idle");
      setPlan(null);
      setResult(null);
      setError(null);
    }
  }

  async function handlePreview() {
    setStep("loading");
    setError(null);
    try {
      const json = (await apiCall(true)) as { plan: Plan };
      setPlan(json.plan);
      setStep("previewed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("idle");
    }
  }

  async function handleConfirm() {
    setStep("importing");
    setError(null);
    try {
      const json = (await apiCall(false)) as { result: Result };
      setResult(json.result);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("previewed");
    }
  }

  const unknownCodes = plan ? Object.entries(plan.skippedSummary.unknownWorkspaceCode) : [];

  return (
    <>
      <Button variant="outline" onClick={() => { setOpen(true); handlePreview(); }}>
        Import Avatars from HeyGen
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Avatars from HeyGen</DialogTitle>
            <DialogDescription>
              Matches HeyGen avatars to enterprises already in the portal by their YM### workspace
              code. Anything that can&apos;t be matched with confidence is skipped, not guessed.
            </DialogDescription>
          </DialogHeader>

          {step === "loading" && (
            <p className="text-sm text-muted-foreground">Checking HeyGen…</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {plan && step !== "loading" && step !== "done" && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">{plan.toCreate.length}</span> of{" "}
                {plan.totalHeyGenAvatars} HeyGen avatars will be linked:
              </p>
              {plan.byEnterprise.length > 0 ? (
                <ul className="space-y-1 pl-4 list-disc">
                  {plan.byEnterprise.map((e) => (
                    <li key={e.enterpriseId}>
                      {e.enterpriseName} — {e.count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nothing new to import.</p>
              )}

              <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                <p>Skipped (not imported):</p>
                <p>
                  {plan.skippedSummary.alreadyLinked} already linked ·{" "}
                  {plan.skippedSummary.noWorkspaceCode} with no recognizable workspace code
                  {unknownCodes.length > 0 && (
                    <>
                      {" "}
                      · unknown workspace codes:{" "}
                      {unknownCodes.map(([code, count]) => `YM${code} (${count})`).join(", ")}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-green-600 dark:text-green-400">
                Linked {result.created} avatar{result.created === 1 ? "" : "s"}.
              </p>
              <ul className="space-y-1 pl-4 list-disc text-muted-foreground">
                {result.byEnterprise.map((e) => (
                  <li key={e.enterpriseId}>
                    {e.enterpriseName} — {e.count}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              {step === "done" ? "Close" : "Cancel"}
            </DialogClose>
            {step === "previewed" && plan && plan.toCreate.length > 0 && (
              <Button size="sm" onClick={handleConfirm}>
                Link {plan.toCreate.length} Avatar{plan.toCreate.length === 1 ? "" : "s"}
              </Button>
            )}
            {step === "importing" && (
              <Button size="sm" disabled>
                Importing…
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
