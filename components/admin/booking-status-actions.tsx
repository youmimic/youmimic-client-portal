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

type ActionState = { loading: boolean; error: string | null };

const idle: ActionState = { loading: false, error: null };

async function postStatusAction(
  bookingId: string,
  endpoint: "cancel" | "confirm",
  reason: string,
): Promise<void> {
  const res = await fetch(`/api/admin/bookings/${bookingId}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
}

function StatusActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  loadingLabel,
  destructive,
  onConfirm,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
  state: ActionState;
}) {
  const [reason, setReason] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="status-action-reason">
            Reason <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Textarea
            id="status-action-reason"
            placeholder="Why is this booking's status changing?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            disabled={state.loading || reason.trim().length === 0}
            onClick={() => onConfirm(reason)}
          >
            {state.loading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BookingStatusActions({
  bookingId,
  status,
  canManage,
}: {
  bookingId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [state, setState] = useState<ActionState>(idle);

  if (!canManage) return null;

  // Valid transitions only — cancelled is terminal, completed is terminal.
  // "confirm" is only meaningful from "pending"; "cancel" is valid from
  // "pending" or "confirmed" (same rule as the customer-facing cancel route).
  const canConfirm = status === "pending";
  const canCancel = status === "pending" || status === "confirmed";

  if (!canConfirm && !canCancel) return null;

  async function runAction(endpoint: "cancel" | "confirm", reason: string) {
    setState({ loading: true, error: null });
    try {
      await postStatusAction(bookingId, endpoint, reason);
      setConfirmOpen(false);
      setCancelOpen(false);
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canConfirm && (
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          Confirm booking
        </Button>
      )}
      {canCancel && (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelOpen(true)}
        >
          Cancel booking
        </Button>
      )}

      <StatusActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm booking"
        description="This marks the booking as confirmed. The customer's dashboard will reflect this on next load."
        confirmLabel="Confirm booking"
        loadingLabel="Confirming…"
        onConfirm={(reason) => runAction("confirm", reason)}
        state={state}
      />

      <StatusActionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel booking"
        description="This marks the booking as cancelled — an admin override independent of the customer's own cancel action. This cannot be undone from this dialog."
        confirmLabel="Cancel booking"
        loadingLabel="Cancelling…"
        destructive
        onConfirm={(reason) => runAction("cancel", reason)}
        state={state}
      />
    </div>
  );
}
