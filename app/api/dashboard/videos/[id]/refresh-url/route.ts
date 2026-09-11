import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshVideoUrl } from "@/lib/heygen/generate-video";

// Manual "Refresh video" button fallback for an already-COMPLETED video
// whose HeyGen URL has (or is about to) expire — distinct from the
// PENDING/PROCESSING-only /refresh route, and from the nightly cron sweep
// (see vercel.json), for whenever a user wants a fresh link immediately
// rather than waiting up to a day for the cron to catch it.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await refreshVideoUrl(id, session.user.id);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "NOT_COMPLETED" ? 400 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl });
}
