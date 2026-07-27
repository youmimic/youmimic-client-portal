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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type ActionState = { loading: boolean; error: string | null };

const idle: ActionState = { loading: false, error: null };

export function AddEnterpriseDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setOwnerEmail("");
      setState(idle);
    }
  }

  async function handleCreate() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch("/api/admin/enterprises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerEmail }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: Record<string, string[] | undefined>;
        };
        throw new Error(
          json.fieldErrors?.ownerEmail?.[0] ?? json.error ?? `Request failed (${res.status})`,
        );
      }
      handleOpenChange(false);
      onCreated?.();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add Enterprise
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Enterprise</DialogTitle>
            <DialogDescription>
              The owner must already have a portal account. Look them up by
              email — create their user account first if they don&apos;t have
              one yet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="add-enterprise-name">Enterprise name</Label>
            <Input
              id="add-enterprise-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Pty Ltd"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-enterprise-owner">Owner email</Label>
            <Input
              id="add-enterprise-owner"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@example.com"
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={state.loading || name.trim().length === 0 || ownerEmail.trim().length === 0}
              onClick={handleCreate}
            >
              {state.loading ? "Creating…" : "Create Enterprise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
