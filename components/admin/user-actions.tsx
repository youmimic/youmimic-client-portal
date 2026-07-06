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
import { Textarea } from "@/components/ui/textarea";

type Props = {
  userId: string;
  isSuspended: boolean;
};

type ActionState = {
  loading: boolean;
  error: string | null;
};

const idle: ActionState = { loading: false, error: null };

export function UserActions({ userId, isSuspended }: Props) {
  const router = useRouter();

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const [suspendReason, setSuspendReason] = useState("");
  const [reactivateReason, setReactivateReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const [suspendState, setSuspendState] = useState<ActionState>(idle);
  const [reactivateState, setReactivateState] = useState<ActionState>(idle);
  const [revokeState, setRevokeState] = useState<ActionState>(idle);

  async function callEndpoint(
    endpoint: string,
    body: Record<string, unknown>,
    setState: React.Dispatch<React.SetStateAction<ActionState>>,
    onSuccess: () => void,
  ) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/admin/users/${userId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setState(idle);
      onSuccess();
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  function handleSuspend() {
    callEndpoint(
      "suspend",
      { reason: suspendReason },
      setSuspendState,
      () => { setSuspendOpen(false); setSuspendReason(""); },
    );
  }

  function handleReactivate() {
    callEndpoint(
      "reactivate",
      { reason: reactivateReason || undefined },
      setReactivateState,
      () => { setReactivateOpen(false); setReactivateReason(""); },
    );
  }

  function handleRevoke() {
    callEndpoint(
      "revoke-sessions",
      { reason: revokeReason || undefined },
      setRevokeState,
      () => { setRevokeOpen(false); setRevokeReason(""); },
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!isSuspended && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { setSuspendState(idle); setSuspendOpen(true); }}
          >
            Suspend User
          </Button>
        )}
        {isSuspended && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setReactivateState(idle); setReactivateOpen(true); }}
          >
            Reactivate User
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setRevokeState(idle); setRevokeOpen(true); }}
        >
          Sign Out All Sessions
        </Button>
      </div>

      {/* Suspend dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend User</DialogTitle>
            <DialogDescription>
              This will immediately block the user from accessing the platform.
              A reason is required for the audit record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">
              Reason <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="suspend-reason"
              placeholder="Reason for suspension…"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {suspendReason.length}/500
            </p>
          </div>
          {suspendState.error && (
            <p className="text-sm text-destructive">{suspendState.error}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={suspendState.loading || suspendReason.trim().length === 0}
              onClick={handleSuspend}
            >
              {suspendState.loading ? "Suspending…" : "Suspend User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate User</DialogTitle>
            <DialogDescription>
              This will restore the user&apos;s access to the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reactivate-reason">Reason (optional)</Label>
            <Textarea
              id="reactivate-reason"
              placeholder="Reason for reactivation…"
              value={reactivateReason}
              onChange={(e) => setReactivateReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {reactivateState.error && (
            <p className="text-sm text-destructive">{reactivateState.error}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              disabled={reactivateState.loading}
              onClick={handleReactivate}
            >
              {reactivateState.loading ? "Reactivating…" : "Reactivate User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke sessions dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out All Sessions</DialogTitle>
            <DialogDescription>
              This will revoke the user&apos;s sessions. They will be signed
              out the next time their session refreshes (within 24 hours) or
              when they next open the app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Textarea
              id="revoke-reason"
              placeholder="Reason for signing out all sessions…"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {revokeState.error && (
            <p className="text-sm text-destructive">{revokeState.error}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={revokeState.loading}
              onClick={handleRevoke}
            >
              {revokeState.loading ? "Signing out…" : "Sign Out All Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
