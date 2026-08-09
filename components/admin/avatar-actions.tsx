"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { UserCircle2 } from "lucide-react";
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
import { LinkAvatarGroupDialog } from "@/components/admin/link-avatar-group-dialog";

type ActionState = { loading: boolean; error: string | null };
const idle: ActionState = { loading: false, error: null };

async function apiCall(url: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  training: "Training",
  pending_consent: "Awaiting consent",
  ready: "Ready",
  active: "Active",
  failed: "Failed",
  error: "Error",
};

const STATUS_CLASS: Record<string, string> = {
  ready: "text-green-600 dark:text-green-400",
  active: "text-green-600 dark:text-green-400",
  failed: "text-destructive",
  error: "text-destructive",
  processing: "text-blue-600 dark:text-blue-400",
  training: "text-blue-600 dark:text-blue-400",
  pending_consent: "text-amber-600 dark:text-amber-400",
};

type Avatar = {
  id: string;
  name: string;
  status: string;
  heygenAvatarId: string | null;
  enterpriseId: string | null;
  previewUrl: string | null;
  _count: { looks: number };
};

type EnterpriseOption = { id: string; name: string };

const NO_ENTERPRISE = "__none__";

function AvatarThumbnail({ previewUrl, name }: { previewUrl: string | null; name: string }) {
  if (previewUrl) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
        <Image src={previewUrl} alt={`${name} preview`} fill unoptimized className="object-cover" sizes="44px" />
      </div>
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
      <UserCircle2 className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}

export function UserAvatarsCard({
  userId,
  avatars,
  enterpriseOptions,
  canManage,
}: {
  userId: string;
  avatars: Avatar[];
  enterpriseOptions: EnterpriseOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Avatar | null>(null);
  const [removing, setRemoving] = useState<Avatar | null>(null);

  const [name, setName] = useState("");
  const [heygenAvatarId, setHeygenAvatarId] = useState("");
  const [enterpriseId, setEnterpriseId] = useState(NO_ENTERPRISE);
  const [state, setState] = useState<ActionState>(idle);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<{ avatarId: string; message: string } | null>(null);

  async function handleSync(avatar: Avatar) {
    setSyncingId(avatar.id);
    setSyncError(null);
    try {
      await apiCall(`/api/admin/users/${userId}/avatars/${avatar.id}/sync`, "POST");
      router.refresh();
    } catch (e) {
      setSyncError({ avatarId: avatar.id, message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setSyncingId(null);
    }
  }

  function resetForm() {
    setName("");
    setHeygenAvatarId("");
    setEnterpriseId(NO_ENTERPRISE);
    setState(idle);
  }

  function openAdd() {
    resetForm();
    setAddOpen(true);
  }

  function openEdit(avatar: Avatar) {
    setName(avatar.name);
    setHeygenAvatarId(avatar.heygenAvatarId ?? "");
    setEnterpriseId(avatar.enterpriseId ?? NO_ENTERPRISE);
    setState(idle);
    setEditing(avatar);
  }

  async function handleAdd() {
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/users/${userId}/avatars`, "POST", {
        name,
        ...(heygenAvatarId ? { heygenAvatarId } : {}),
        ...(enterpriseId !== NO_ENTERPRISE ? { enterpriseId } : {}),
      });
      setAddOpen(false);
      resetForm();
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleEdit() {
    if (!editing) return;
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/users/${userId}/avatars/${editing.id}`, "PATCH", {
        name,
        heygenAvatarId: heygenAvatarId || null,
        enterpriseId: enterpriseId !== NO_ENTERPRISE ? enterpriseId : null,
      });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/users/${userId}/avatars/${removing.id}`, "DELETE");
      setRemoving(null);
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        {avatars.length === 0 ? (
          <p className="text-muted-foreground">No avatars linked yet.</p>
        ) : (
          avatars.map((avatar) => (
            <div key={avatar.id} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0">
              <div className="flex items-center gap-3 min-w-0">
                <AvatarThumbnail previewUrl={avatar.previewUrl} name={avatar.name} />
                <div className="min-w-0">
                  <div className="font-medium truncate">{avatar.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className={STATUS_CLASS[avatar.status] ?? ""}>
                      {STATUS_LABEL[avatar.status] ?? avatar.status}
                    </span>
                    {avatar._count.looks > 0 ? (
                      <>
                        {" · "}
                        {avatar._count.looks === 1 ? "1 look" : `${avatar._count.looks} looks`} (HeyGen import)
                      </>
                    ) : (
                      avatar.heygenAvatarId && (
                        <>
                          {" · "}
                          <span className="font-mono truncate">{avatar.heygenAvatarId}</span>
                        </>
                      )
                    )}
                    {avatar.enterpriseId && (
                      <>
                        {" · "}
                        {enterpriseOptions.find((e) => e.id === avatar.enterpriseId)?.name ?? "Unknown enterprise"}
                      </>
                    )}
                  </div>
                  {syncError?.avatarId === avatar.id && (
                    <p className="text-xs text-destructive">{syncError.message}</p>
                  )}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={syncingId === avatar.id}
                    onClick={() => handleSync(avatar)}
                  >
                    {syncingId === avatar.id ? "Syncing…" : "Sync now"}
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => openEdit(avatar)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoving(avatar)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openAdd}>
              Link Avatar
            </Button>
            <LinkAvatarGroupDialog userId={userId} enterpriseOptions={enterpriseOptions} />
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Avatar</DialogTitle>
            <DialogDescription>
              The avatar itself is created and trained directly in HeyGen — this just links it to this
              user so it shows up in their dashboard and can sync live status from HeyGen.
            </DialogDescription>
          </DialogHeader>
          <AvatarForm
            name={name} setName={setName}
            heygenAvatarId={heygenAvatarId} setHeygenAvatarId={setHeygenAvatarId}
            enterpriseId={enterpriseId} setEnterpriseId={setEnterpriseId}
            enterpriseOptions={enterpriseOptions}
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleAdd}>
              {state.loading ? "Linking…" : "Link Avatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Avatar</DialogTitle>
          </DialogHeader>
          <AvatarForm
            name={name} setName={setName}
            heygenAvatarId={heygenAvatarId} setHeygenAvatarId={setHeygenAvatarId}
            enterpriseId={enterpriseId} setEnterpriseId={setEnterpriseId}
            enterpriseOptions={enterpriseOptions}
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleEdit}>
              {state.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Avatar</DialogTitle>
            <DialogDescription>
              {removing?.name} will be unlinked from this user and no longer appear in their dashboard.
              This doesn&apos;t delete anything in HeyGen itself.
            </DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button variant="destructive" size="sm" disabled={state.loading} onClick={handleRemove}>
              {state.loading ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AvatarForm({
  name, setName, heygenAvatarId, setHeygenAvatarId, enterpriseId, setEnterpriseId, enterpriseOptions,
}: {
  name: string; setName: (v: string) => void;
  heygenAvatarId: string; setHeygenAvatarId: (v: string) => void;
  enterpriseId: string; setEnterpriseId: (v: string) => void;
  enterpriseOptions: EnterpriseOption[];
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="avatar-name">Name</Label>
        <Input id="avatar-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="avatar-heygen-id">HeyGen avatar ID (optional)</Label>
        <Input
          id="avatar-heygen-id"
          value={heygenAvatarId}
          onChange={(e) => setHeygenAvatarId(e.target.value)}
          placeholder="e.g. b429c9d5a9bd49a98d73bbd75d7940d5"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          The avatar_id / look_id from the HeyGen dashboard. Leave blank until it&apos;s known — status
          won&apos;t sync until this is set.
        </p>
      </div>
      {enterpriseOptions.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="avatar-enterprise">Enterprise (optional)</Label>
          <Select value={enterpriseId} onValueChange={(v) => setEnterpriseId(v ?? NO_ENTERPRISE)} name="avatar-enterprise">
            <SelectTrigger id="avatar-enterprise"><SelectValue /></SelectTrigger>
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
  );
}
