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

export function AddUserDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setEmail("");
      setState(idle);
    }
  }

  async function handleCreate() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: Record<string, string[] | undefined>;
        };
        throw new Error(
          json.fieldErrors?.email?.[0] ?? json.error ?? `Request failed (${res.status})`,
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
        Add User
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Creates an account with no password. The person will get an
              email with a link to set their own password before they can log
              in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="add-user-name">Name</Label>
            <Input
              id="add-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-user-email">Email</Label>
            <Input
              id="add-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={state.loading || name.trim().length === 0 || email.trim().length === 0}
              onClick={handleCreate}
            >
              {state.loading ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
