import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/api-guards";
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
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await params;

  const result = await refreshVideoUrl(id, session.user.id);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "NOT_COMPLETED" ? 400 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl });
}
