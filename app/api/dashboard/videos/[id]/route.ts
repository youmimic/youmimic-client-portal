import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { deleteHeyGenVideo, HeyGenApiError } from "@/lib/heygen";

// Deletes a video from both this app and HeyGen. The HeyGen call is
// best-effort: a video_not_found there (already gone, or it never made it
// past PENDING/PROCESSING to get a heygenVideoId) is fine and not
// reported; any other HeyGen-side failure still lets the local row get
// deleted (so a user isn't stuck unable to clear an entry from their own
// portal because of a transient HeyGen API issue), but is surfaced back
// as a warning rather than silently swallowed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.generatedVideo.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, heygenVideoId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let heygenWarning: string | null = null;
  if (existing.heygenVideoId) {
    try {
      await deleteHeyGenVideo(existing.heygenVideoId);
    } catch (err) {
      const notFound = err instanceof HeyGenApiError && err.status === 404;
      if (!notFound) {
        heygenWarning =
          err instanceof HeyGenApiError
            ? err.message
            : "Could not reach HeyGen to delete the video there.";
      }
    }
  }

  await prisma.generatedVideo.delete({ where: { id } });

  return NextResponse.json({
    ok: true,
    ...(heygenWarning ? { warning: `Removed from portal. HeyGen delete failed: ${heygenWarning}` } : {}),
  });
}
