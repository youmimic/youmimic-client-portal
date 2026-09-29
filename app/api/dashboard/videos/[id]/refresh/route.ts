import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { refreshGeneratedVideoStatus } from "@/lib/heygen/generate-video";

// Manual on-demand fallback for whenever the webhook hasn't fired yet (or
// isn't registered against this environment) — re-fetches authoritative
// state from HeyGen. Not a polling endpoint the client calls on a timer;
// the Studio UI exposes this as an explicit "Check status" action.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await params;

  const result = await refreshGeneratedVideoStatus(id, session.user.id);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ status: result.status, videoUrl: result.videoUrl });
}
