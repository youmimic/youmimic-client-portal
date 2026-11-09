"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { UserCircle2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

// Sibling of components/admin/avatar-actions.tsx's UserAvatarsCard, for the
// platform-wide "public avatars" pool (/admin/avatars) rather than one
// customer's avatars — a separate component rather than a second mode on
// that one, since it's already large and has no notion of "no particular
// owning user" or "no enterprise" built in. Same visual conventions
// (status colors, drag-to-reorder looks, confirm dialogs) are reused by eye,
// not by shared code, given how different the data/route shape is.

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

type Look = {
  id: string;
  name: string;
  heygenLookId: string;
  status: string;
  previewUrl: string | null;
};

export type PublicAvatar = {
  id: string;
  name: string;
  status: string;
  heygenAvatarId: string | null;
  previewUrl: string | null;
  lookCount: number;
  looks: Look[];
};

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

function SortableLookRow({
  look,
  canManage,
  onRemove,
  onRename,
}: {
  look: Look;
  canManage: boolean;
  onRemove: (look: Look) => void;
  onRename: (look: Look) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: look.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        {canManage && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
            aria-label={`Reorder ${look.name}`}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <AvatarThumbnail previewUrl={look.previewUrl} name={look.name} />
        <div className="min-w-0">
          <div className="truncate">{look.name}</div>
          <div className="text-xs text-muted-foreground">
            <span className={STATUS_CLASS[look.status] ?? ""}>{STATUS_LABEL[look.status] ?? look.status}</span>
            {" · "}
            <span className="font-mono truncate">{look.heygenLookId}</span>
          </div>
        </div>
      </div>
      {canManage && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="xs" onClick={() => onRename(look)}>
            Rename
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={() => onRemove(look)}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableLooksList({
  avatarId,
  looks,
  canManage,
  onRemove,
  onRename,
}: {
  avatarId: string;
  looks: Look[];
  canManage: boolean;
  onRemove: (look: Look) => void;
  onRename: (look: Look) => void;
}) {
  const router = useRouter();
  const [ordered, setOrdered] = useState(looks);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ordered.findIndex((l) => l.id === active.id);
    const newIndex = ordered.findIndex((l) => l.id === over.id);
    const previous = ordered;
    const reordered = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(reordered);

    try {
      await apiCall(`/api/admin/public-avatars/${avatarId}/looks/reorder`, "POST", {
        orderedIds: reordered.map((l) => l.id),
      });
      router.refresh();
    } catch {
      setOrdered(previous);
    }
  }

  if (!canManage) {
    return (
      <div className="mt-2 ml-14 space-y-1.5">
        {ordered.map((look) => (
          <SortableLookRow key={look.id} look={look} canManage={false} onRemove={onRemove} onRename={onRename} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 ml-14 space-y-1.5">
      <DndContext id={`public-avatar-looks-${avatarId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {ordered.map((look) => (
            <SortableLookRow key={look.id} look={look} canManage={canManage} onRemove={onRemove} onRename={onRename} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function PublicAvatarsCard({ avatars, canManage }: { avatars: PublicAvatar[]; canManage: boolean }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PublicAvatar | null>(null);
  const [removing, setRemoving] = useState<PublicAvatar | null>(null);
  const [removingLook, setRemovingLook] = useState<{ avatarId: string; look: Look } | null>(null);
  const [removeLookState, setRemoveLookState] = useState<ActionState>(idle);
  const [renamingLook, setRenamingLook] = useState<{ avatarId: string; look: Look } | null>(null);
  const [renameLookName, setRenameLookName] = useState("");
  const [renameLookState, setRenameLookState] = useState<ActionState>(idle);

  const [name, setName] = useState("");
  const [heygenAvatarId, setHeygenAvatarId] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<{ avatarId: string; message: string } | null>(null);

  const [addingLookTo, setAddingLookTo] = useState<PublicAvatar | null>(null);
  const [lookId, setLookId] = useState("");
  const [lookState, setLookState] = useState<ActionState>(idle);

  async function handleSync(avatar: PublicAvatar) {
    setSyncingId(avatar.id);
    setSyncError(null);
    try {
      await apiCall(`/api/admin/public-avatars/${avatar.id}/sync`, "POST");
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
    setState(idle);
  }

  function openAdd() {
    resetForm();
    setAddOpen(true);
  }

  function openEdit(avatar: PublicAvatar) {
    setName(avatar.name);
    setHeygenAvatarId(avatar.heygenAvatarId ?? "");
    setState(idle);
    setEditing(avatar);
  }

  async function handleAdd() {
    setState({ loading: true, error: null });
    try {
      await apiCall("/api/admin/public-avatars", "POST", {
        name,
        ...(heygenAvatarId ? { heygenAvatarId } : {}),
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
      await apiCall(`/api/admin/public-avatars/${editing.id}`, "PATCH", {
        name,
        heygenAvatarId: heygenAvatarId || null,
      });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  function openAddLook(avatar: PublicAvatar) {
    setLookId("");
    setLookState(idle);
    setAddingLookTo(avatar);
  }

  async function handleAddLook() {
    if (!addingLookTo) return;
    setLookState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/public-avatars/${addingLookTo.id}/looks`, "POST", { heygenLookId: lookId });
      setAddingLookTo(null);
      router.refresh();
    } catch (e) {
      setLookState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/public-avatars/${removing.id}`, "DELETE");
      setRemoving(null);
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleRemoveLook() {
    if (!removingLook) return;
    setRemoveLookState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/public-avatars/${removingLook.avatarId}/looks/${removingLook.look.id}`, "DELETE");
      setRemovingLook(null);
      setRemoveLookState(idle);
      router.refresh();
    } catch (e) {
      setRemoveLookState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  function openRenameLook(avatarId: string, look: Look) {
    setRenameLookName(look.name);
    setRenameLookState(idle);
    setRenamingLook({ avatarId, look });
  }

  async function handleRenameLook() {
    if (!renamingLook) return;
    setRenameLookState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/public-avatars/${renamingLook.avatarId}/looks/${renamingLook.look.id}`, "PATCH", {
        name: renameLookName,
      });
      setRenamingLook(null);
      router.refresh();
    } catch (e) {
      setRenameLookState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        {avatars.length === 0 ? (
          <p className="text-muted-foreground">No public avatars yet.</p>
        ) : (
          avatars.map((avatar) => (
            <div key={avatar.id} className="py-2 border-t first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarThumbnail previewUrl={avatar.previewUrl} name={avatar.name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{avatar.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className={STATUS_CLASS[avatar.status] ?? ""}>
                        {STATUS_LABEL[avatar.status] ?? avatar.status}
                      </span>
                      {avatar.lookCount > 0 ? (
                        <>
                          {" · "}
                          {avatar.lookCount === 1 ? "1 look" : `${avatar.lookCount} looks`}
                        </>
                      ) : (
                        avatar.heygenAvatarId && (
                          <>
                            {" · "}
                            <span className="font-mono truncate">{avatar.heygenAvatarId}</span>
                          </>
                        )
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
                    {avatar.heygenAvatarId && (
                      <Button variant="ghost" size="xs" onClick={() => openAddLook(avatar)}>
                        Add look
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoving(avatar)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {avatar.looks.length > 0 && (
                <SortableLooksList
                  key={avatar.looks.map((l) => l.id).join(",")}
                  avatarId={avatar.id}
                  looks={avatar.looks}
                  canManage={canManage}
                  onRemove={(look) => setRemovingLook({ avatarId: avatar.id, look })}
                  onRename={(look) => openRenameLook(avatar.id, look)}
                />
              )}
            </div>
          ))
        )}
        {canManage && (
          <Button variant="outline" size="sm" onClick={openAdd}>
            Add public avatar
          </Button>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add public avatar</DialogTitle>
            <DialogDescription>
              Usable by every signed-in user, regardless of who owns it internally — for stock/shared
              avatars only. The avatar itself still lives in HeyGen; this just links it.
            </DialogDescription>
          </DialogHeader>
          <PublicAvatarForm name={name} setName={setName} heygenAvatarId={heygenAvatarId} setHeygenAvatarId={setHeygenAvatarId} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleAdd}>
              {state.loading ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit public avatar</DialogTitle>
          </DialogHeader>
          <PublicAvatarForm name={name} setName={setName} heygenAvatarId={heygenAvatarId} setHeygenAvatarId={setHeygenAvatarId} />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleEdit}>
              {state.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add look dialog */}
      <Dialog open={addingLookTo !== null} onOpenChange={(o) => { if (!o) setAddingLookTo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add look</DialogTitle>
            <DialogDescription>
              Paste a specific look id from HeyGen&apos;s dashboard. It&apos;s verified against HeyGen and
              checked that it actually belongs to {addingLookTo?.name} before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="public-look-id">HeyGen look ID</Label>
            <Input
              id="public-look-id"
              value={lookId}
              onChange={(e) => setLookId(e.target.value)}
              placeholder="e.g. c9151042046340a18413cef1f5701df7"
              className="font-mono text-sm"
            />
          </div>
          {lookState.error && <p className="text-sm text-destructive">{lookState.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={lookState.loading || lookId.trim().length === 0} onClick={handleAddLook}>
              {lookState.loading ? "Adding…" : "Add look"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename look dialog */}
      <Dialog open={renamingLook !== null} onOpenChange={(o) => { if (!o) setRenamingLook(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename look</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-look-name">Name</Label>
            <Input id="rename-look-name" value={renameLookName} onChange={(e) => setRenameLookName(e.target.value)} />
          </div>
          {renameLookState.error && <p className="text-sm text-destructive">{renameLookState.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={renameLookState.loading || renameLookName.trim().length === 0} onClick={handleRenameLook}>
              {renameLookState.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete public avatar</DialogTitle>
            <DialogDescription>
              {removing?.name} will no longer be usable by anyone, and disappears from every user&apos;s
              Shared avatars section. This doesn&apos;t delete anything in HeyGen itself.
            </DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button variant="destructive" size="sm" disabled={state.loading} onClick={handleRemove}>
              {state.loading ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove look confirm */}
      <Dialog open={removingLook !== null} onOpenChange={(o) => { if (!o) setRemovingLook(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove look</DialogTitle>
            <DialogDescription>
              {removingLook?.look.name} will be unlinked from this avatar and no longer selectable for new
              videos. This doesn&apos;t delete anything in HeyGen itself.
            </DialogDescription>
          </DialogHeader>
          {removeLookState.error && <p className="text-sm text-destructive">{removeLookState.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button variant="destructive" size="sm" disabled={removeLookState.loading} onClick={handleRemoveLook}>
              {removeLookState.loading ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PublicAvatarForm({
  name, setName, heygenAvatarId, setHeygenAvatarId,
}: {
  name: string; setName: (v: string) => void;
  heygenAvatarId: string; setHeygenAvatarId: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="public-avatar-name">Name</Label>
        <Input id="public-avatar-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="public-avatar-heygen-id">HeyGen avatar ID (optional)</Label>
        <Input
          id="public-avatar-heygen-id"
          value={heygenAvatarId}
          onChange={(e) => setHeygenAvatarId(e.target.value)}
          placeholder="e.g. 6a2aa7e8bb224e609beffbbd2ca93d0e"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          The avatar_id / look_id from the HeyGen dashboard — can be a HeyGen stock avatar, not just one
          of our own. Leave blank until it&apos;s known — status won&apos;t sync until this is set.
        </p>
      </div>
    </div>
  );
}
