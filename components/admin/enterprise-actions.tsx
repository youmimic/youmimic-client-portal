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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OwnerInfo = { id: string; email: string; name: string | null };

type EligibleMember = { userId: string; email: string; name: string | null };

type MemberRow = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

type ActionState = { loading: boolean; error: string | null };

const idle: ActionState = { loading: false, error: null };

async function postAction(
  enterpriseId: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/admin/enterprises/${enterpriseId}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
}

export function TransferOwnershipAction({
  enterpriseId,
  currentOwner,
  eligibleMembers,
  canManage,
}: {
  enterpriseId: string;
  currentOwner: OwnerInfo | null;
  eligibleMembers: EligibleMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  if (!canManage) return null;

  const selectedMember = eligibleMembers.find((m) => m.userId === newOwnerUserId);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setNewOwnerUserId("");
      setReason("");
      setState(idle);
    }
  }

  async function handleTransfer() {
    setState({ loading: true, error: null });
    try {
      await postAction(enterpriseId, "transfer-owner", { newOwnerUserId, reason });
      setOpen(false);
      setNewOwnerUserId("");
      setReason("");
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={eligibleMembers.length === 0}
        title={
          eligibleMembers.length === 0
            ? "Add a member to this enterprise before transferring ownership"
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        Transfer Ownership
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              This will move enterprise ownership from{" "}
              <span className="font-medium text-foreground">
                {currentOwner?.email ?? "the current owner"}
              </span>{" "}
              to the selected member. Only the owner can manage billing and
              enterprise-level settings — choose carefully.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="new-owner">New owner</Label>
            <Select
              value={newOwnerUserId}
              onValueChange={(val) => setNewOwnerUserId(val ?? "")}
              name="new-owner"
            >
              <SelectTrigger id="new-owner">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {eligibleMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name ? `${member.name} (${member.email})` : member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMember && (
            <p className="text-sm text-muted-foreground">
              {currentOwner?.email ?? "Current owner"} &rarr; {selectedMember.email}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="transfer-reason">
              Reason <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="transfer-reason"
              placeholder="Why is ownership being transferred?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={state.loading || !newOwnerUserId || reason.trim().length === 0}
              onClick={handleTransfer}
            >
              {state.loading ? "Transferring…" : "Transfer Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EnterpriseMembersTable({
  enterpriseId,
  ownerUserId,
  members,
  canManage,
}: {
  enterpriseId: string;
  ownerUserId: string | null;
  members: MemberRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<MemberRow | null>(null);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setTarget(null);
      setReason("");
      setState(idle);
    }
  }

  async function handleRemove() {
    if (!target) return;
    setState({ loading: true, error: null });
    try {
      await postAction(enterpriseId, "remove-member", {
        memberUserId: target.userId,
        reason,
      });
      setTarget(null);
      setReason("");
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No members.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-muted-foreground">Email</th>
              <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                Name
              </th>
              <th className="pb-2 font-medium text-muted-foreground">Role</th>
              {canManage && <th className="pb-2 font-medium text-muted-foreground text-right" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="py-2 pr-4 font-medium">{member.email}</td>
                <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                  {member.name ?? "—"}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{member.role}</td>
                {canManage && (
                  <td className="py-2 text-right">
                    {member.userId !== ownerUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setTarget(member)}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={target !== null} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              {target?.email} will lose access to enterprise-only features
              immediately. This cannot be undone from this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="remove-reason">
              Reason <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="remove-reason"
              placeholder="Why is this member being removed?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={state.loading || reason.trim().length === 0}
              onClick={handleRemove}
            >
              {state.loading ? "Removing…" : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EnterpriseInvitesTable({
  enterpriseId,
  invites,
  canManage,
}: {
  enterpriseId: string;
  invites: InviteRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<InviteRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelState, setCancelState] = useState<ActionState>(idle);
  const [resendId, setResendId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  function handleCancelOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCancelTarget(null);
      setCancelReason("");
      setCancelState(idle);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelState({ loading: true, error: null });
    try {
      await postAction(enterpriseId, "cancel-invite", {
        inviteId: cancelTarget.id,
        reason: cancelReason,
      });
      setCancelTarget(null);
      setCancelReason("");
      setCancelState(idle);
      router.refresh();
    } catch (e) {
      setCancelState({
        loading: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  async function handleResend(invite: InviteRow) {
    setResendId(invite.id);
    setResendError(null);
    try {
      await postAction(enterpriseId, "resend-invite", { inviteId: invite.id });
      setResendId(null);
      router.refresh();
    } catch (e) {
      setResendId(null);
      setResendError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending or recent invites.</p>;
  }

  return (
    <>
      {resendError && <p className="mb-2 text-sm text-destructive">{resendError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-muted-foreground">Email</th>
              <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                Role
              </th>
              <th className="pb-2 font-medium text-muted-foreground">Status</th>
              <th className="pb-2 font-medium text-muted-foreground text-right">Sent</th>
              {canManage && <th className="pb-2 font-medium text-muted-foreground text-right" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td className="py-2 pr-4 font-medium">{invite.email}</td>
                <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                  {invite.role}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {invite.status}
                  </span>
                </td>
                <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                  {new Date(invite.createdAt).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="py-2 pl-4 text-right whitespace-nowrap">
                    {invite.status === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={resendId === invite.id}
                          onClick={() => handleResend(invite)}
                        >
                          {resendId === invite.id ? "Sending…" : "Resend"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancelTarget(invite)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={cancelTarget !== null} onOpenChange={handleCancelOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Invite</DialogTitle>
            <DialogDescription>
              The invite sent to {cancelTarget?.email} will no longer be
              acceptable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-invite-reason">
              Reason <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="cancel-invite-reason"
              placeholder="Why is this invite being cancelled?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
          {cancelState.error && (
            <p className="text-sm text-destructive">{cancelState.error}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Keep Invite</DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelState.loading || cancelReason.trim().length === 0}
              onClick={handleCancel}
            >
              {cancelState.loading ? "Cancelling…" : "Cancel Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
