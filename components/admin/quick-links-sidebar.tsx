"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ExternalLink, GripVertical, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type QuickLinkItem = { id: string; label: string; url: string; isDefault: boolean };

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

function SortableLink({
  link,
  onRemove,
  onNavigate,
}: {
  link: QuickLinkItem;
  onRemove: (id: string) => void;
  onNavigate?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="group flex items-center gap-0.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-sidebar-foreground/30 hover:text-sidebar-foreground/70 active:cursor-grabbing"
        aria-label={`Reorder ${link.label}`}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{link.label}</span>
      </a>
      {link.isDefault ? (
        <span
          className="shrink-0 rounded p-1 text-sidebar-foreground/20"
          title="Default link — can't be removed"
          aria-label={`${link.label} is a default link and can't be removed`}
        >
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRemove(link.id)}
          className="shrink-0 rounded p-1 text-sidebar-foreground/0 transition-colors hover:text-destructive group-hover:text-sidebar-foreground/40"
          aria-label={`Remove ${link.label}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

// Shared admin bookmark list — every admin who can see this sidebar can
// manage it (canManageQuickLinks is BILLING_ADMIN-minimum, the floor of the
// role hierarchy, so this is effectively "any admin"). Reordering and
// removal update optimistically and revert if the request fails, so a slow
// or dropped request never leaves the UI showing something the server
// doesn't actually have.
export function QuickLinksSidebar({
  initialLinks,
  onNavigate,
}: {
  initialLinks: QuickLinkItem[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = links.findIndex((l) => l.id === active.id);
    const newIndex = links.findIndex((l) => l.id === over.id);
    const previous = links;
    const reordered = arrayMove(links, oldIndex, newIndex);
    setLinks(reordered);

    try {
      await apiCall("/api/admin/quick-links/reorder", "POST", { orderedIds: reordered.map((l) => l.id) });
      router.refresh();
    } catch {
      setLinks(previous);
    }
  }

  async function handleRemove(id: string) {
    const previous = links;
    setLinks(links.filter((l) => l.id !== id));
    try {
      await apiCall(`/api/admin/quick-links/${id}`, "DELETE");
      router.refresh();
    } catch {
      setLinks(previous);
    }
  }

  function resetAddForm() {
    setLabel("");
    setUrlValue("");
    setError(null);
  }

  async function handleAdd() {
    setLoading(true);
    setError(null);
    try {
      const json = (await apiCall("/api/admin/quick-links", "POST", {
        label: label.trim(),
        url: urlValue.trim(),
      })) as { quickLink: QuickLinkItem };
      setLinks([...links, json.quickLink]);
      setAddOpen(false);
      resetAddForm();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Quick Links
        </span>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Add quick link"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {links.length === 0 ? (
        <p className="px-3 py-1 text-xs text-sidebar-foreground/40">No links yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-0.5" role="list">
              {links.map((link) => (
                <SortableLink key={link.id} link={link} onRemove={handleRemove} onNavigate={onNavigate} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetAddForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Quick Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="quick-link-label">Label</Label>
              <Input
                id="quick-link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. HeyGen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-link-url">URL</Label>
              <Input
                id="quick-link-url"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={loading || label.trim().length === 0 || urlValue.trim().length === 0}
              onClick={handleAdd}
            >
              {loading ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
