import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import prisma from "@/lib/prisma";

// Removes a saved watermark from the user's library. The Blob delete is
// best-effort, same pattern as /api/dashboard/videos/[id]'s HeyGen delete:
// a failure there still lets the local row (and so the library entry) go
// away, but is surfaced as a warning rather than silently swallowed, so a
// transient Blob-storage issue never leaves a user stuck unable to clear an
// entry from their own library.
//
// A project stores this watermark's URL by value, not a foreign key (see
// Watermark's schema comment) — so deleting the blob out from under a
// project that still references it would leave that project pointed at a
// dead image the next time it's opened or regenerated. Blocked outright
// below rather than left as a silent dangling reference; the one place
// this route doesn't need to check is the open editor's own in-memory
// state, which clears itself client-side when its current selection is the
// thing being deleted (see settings-panel.tsx's deleteSavedWatermark).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await params;

  const existing = await prisma.watermark.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, url: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inUse = await prisma.videoProject.findMany({
    where: { userId: session.user.id, watermarkUrl: existing.url },
    select: { title: true },
    take: 5,
  });
  if (inUse.length > 0) {
    const names = inUse.map((p) => p.title.trim() || "Untitled video").join(", ");
    return NextResponse.json(
      {
        error: `Still used by ${inUse.length === 1 ? "a project" : `${inUse.length} projects`} (${names}). Remove it from ${inUse.length === 1 ? "that project" : "those projects"} first.`,
      },
      { status: 409 },
    );
  }

  let blobWarning: string | null = null;
  try {
    await del(existing.url);
  } catch (err) {
    console.error("Watermark delete (Blob) failed:", err);
    blobWarning = "Removed from your library, but the image file may still exist in storage.";
  }

  await prisma.watermark.delete({ where: { id } });

  return NextResponse.json({ ok: true, ...(blobWarning ? { warning: blobWarning } : {}) });
}
