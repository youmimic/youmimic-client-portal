"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Plan = {
  heygenGroupId: string;
  groupName: string;
  totalLooks: number;
  status: "new" | "add_looks" | "no_new_looks";
  existingAvatarId: string | null;
  existingAvatarName: string | null;
  looks: unknown[];
};

type Result = { avatarId: string; created: boolean; looksAdded: number };

type Step = "idle" | "loading" | "previewed" | "importing" | "done";

type EnterpriseOption = { id: string; name: string };

const NO_ENTERPRISE = "__none__";

async function apiCall(userId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/users/${userId}/avatars/link-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// Complements the single-look "Link Avatar" flow and the automated
// enterprise-wide bulk import: this handles the case where an admin has a
// specific HeyGen avatar *group* id in hand (e.g. copied off HeyGen's own
// dashboard) and wants every look under it imported as one avatar identity
// for a specific user — the path for identities whose look names carry no
// recognizable workspace code, so the bulk import silently skips them.
export function LinkAvatarGroupDialog({
  userId,
  enterpriseOptions,
}: {
  userId: string;
  enterpriseOptions: EnterpriseOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [groupId, setGroupId] = useState("");
  const [enterpriseId, setEnterpriseId] = useState(NO_ENTERPRISE);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("idle");
      setGroupId("");
      setEnterpriseId(NO_ENTERPRISE);
      setPlan(null);
      setResult(null);
      setError(null);
    }
  }

  async function handlePreview() {
    setStep("loading");
    setError(null);
    try {
      const json = (await apiCall(userId, {
        heygenGroupId: groupId.trim(),
        ...(enterpriseId !== NO_ENTERPRISE ? { enterpriseId } : {}),
        dryRun: true,
      })) as { plan: Plan };
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
      const json = (await apiCall(userId, {
        heygenGroupId: groupId.trim(),
        ...(enterpriseId !== NO_ENTERPRISE ? { enterpriseId } : {}),
        dryRun: false,
      })) as { result: Result };
      setResult(json.result);
      setStep("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("previewed");
    }
  }

  function resetToIdle() {
    setStep("idle");
    setPlan(null);
    setError(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Import Avatar Identity
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Avatar Identity by Group ID</DialogTitle>
            <DialogDescription>
              Pulls in every look under a specific HeyGen avatar group as one avatar for this user —
              use this for identities the automatic HeyGen import can&apos;t auto-match to an enterprise.
            </DialogDescription>
          </DialogHeader>

          {step === "idle" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="group-id">HeyGen avatar group ID</Label>
                <Input
                  id="group-id"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="e.g. c09070c38aa64a0eaf1b6a5893f82409"
                  className="font-mono text-sm"
                />
              </div>
              {enterpriseOptions.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="group-enterprise">Enterprise (optional)</Label>
                  <Select value={enterpriseId} onValueChange={(v) => setEnterpriseId(v ?? NO_ENTERPRISE)} name="group-enterprise">
                    <SelectTrigger id="group-enterprise"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ENTERPRISE}>None — personal avatar</SelectItem>
                      {enterpriseOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {step === "loading" && <p className="text-sm text-muted-foreground">Checking HeyGen…</p>}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {plan && step !== "loading" && step !== "done" && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{plan.groupName}</span> — {plan.totalLooks} look
                {plan.totalLooks === 1 ? "" : "s"} in HeyGen.
              </p>
              {plan.status === "new" && (
                <p className="text-muted-foreground">
                  Will create a new avatar with all {plan.looks.length} looks.
                </p>
              )}
              {plan.status === "add_looks" && (
                <p className="text-muted-foreground">
                  Already linked as &quot;{plan.existingAvatarName}&quot; — will add {plan.looks.length} new look
                  {plan.looks.length === 1 ? "" : "s"} not yet imported.
                </p>
              )}
              {plan.status === "no_new_looks" && (
                <p className="text-muted-foreground">
                  Already fully imported as &quot;{plan.existingAvatarName}&quot; — nothing new to add.
                </p>
              )}
            </div>
          )}

          {step === "done" && result && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              {result.created
                ? `Created a new avatar with ${result.looksAdded} looks.`
                : result.looksAdded > 0
                  ? `Added ${result.looksAdded} new looks to the existing avatar.`
                  : "Already up to date — nothing to add."}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              {step === "done" ? "Close" : "Cancel"}
            </DialogClose>
            {step === "idle" && (
              <Button size="sm" disabled={groupId.trim().length === 0} onClick={handlePreview}>
                Preview
              </Button>
            )}
            {step === "previewed" && plan && plan.status !== "no_new_looks" && (
              <Button size="sm" onClick={handleConfirm}>
                {plan.status === "new" ? `Import ${plan.looks.length} Looks` : `Add ${plan.looks.length} Looks`}
              </Button>
            )}
            {step === "previewed" && plan && plan.status === "no_new_looks" && (
              <Button size="sm" variant="outline" onClick={resetToIdle}>
                Try another ID
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
