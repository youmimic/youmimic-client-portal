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
// Watermark's schema comment). Deleting always removes the library entry,
// but the image file is only deleted once no project of this user still
// points at it. Otherwise an older project would show a broken image or
// regenerate without its watermark. Blocking the delete instead left people
// stuck, since the projects named in the error were often several
// identically titled "Untitled video" drafts with no way to tell them apart.
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

  const projectsUsingIt = await prisma.videoProject.count({
    where: { userId: session.user.id, watermarkUrl: existing.url },
  });

  let blobWarning: string | null = null;
  if (projectsUsingIt === 0) {
    try {
      await del(existing.url);
    } catch (err) {
      console.error("Watermark delete (Blob) failed:", err);
      blobWarning = "Removed from your library, but the image file may still exist in storage.";
    }
  }

  await prisma.watermark.delete({ where: { id } });

  return NextResponse.json({ ok: true, ...(blobWarning ? { warning: blobWarning } : {}) });
}
