"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectStatusBadge, type ProjectStatusValue } from "@/components/dashboard/project/project-status-badge";
import { formatDateTime } from "@/lib/video-display";

// One in-progress project on the Videos page, with a delete button that always
// asks first. Generating projects can't be deleted until they finish.
export function ProjectCard({
  id,
  title,
  status,
  sceneCount,
  updatedAt,
  thumbnailUrl,
}: {
  id: string;
  title: string;
  status: ProjectStatusValue;
  sceneCount: number;
  updatedAt: string;
  // The look used by the first scene.
  thumbnailUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = title.trim() || "Untitled video";
  const isDraft = status === "DRAFT";
  const canDelete = status !== "GENERATING";

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? `We couldn't delete it (${res.status}).`);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow focus-within:ring-2 focus-within:ring-primary hover:ring-primary/50">
      <Link
        href={`/dashboard/videos/projects/${id}`}
        className="group block focus-visible:outline-none"
        aria-label={`Open ${name}`}
      >
        <div className="relative flex aspect-video items-center justify-center bg-muted">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="(min-width: 1024px) 33vw, 50vw"
            />
          ) : (
            <Layers className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
          )}
          <ProjectStatusBadge status={status} className="absolute left-2 top-2 shadow-sm" />
        </div>
        <div className="space-y-1 p-3 pb-11">
          <p className="truncate text-sm font-medium group-hover:text-primary">{name}</p>
          <p className="text-xs text-muted-foreground">
            {sceneCount} {sceneCount === 1 ? "scene" : "scenes"} · Edited {formatDateTime(updatedAt)}
          </p>
        </div>
      </Link>

      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute bottom-1.5 right-1.5 text-destructive hover:text-destructive"
          onClick={() => setOpen(true)}
          aria-label={`${isDraft ? "Delete draft" : "Delete project"} ${name}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {isDraft ? "Delete draft" : "Delete"}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDraft ? "Delete this draft?" : "Delete this project?"}</DialogTitle>
            <DialogDescription>
              &quot;{name}&quot; and all {sceneCount} {sceneCount === 1 ? "scene" : "scenes"} will be removed. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              {isDraft ? "Keep draft" : "Keep project"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Deleting..." : isDraft ? "Delete draft" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
