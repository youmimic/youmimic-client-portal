import { NextResponse } from "next/server";
import { refreshExpiringVideoUrls, sweepStuckGenerations } from "@/lib/heygen/generate-video";

// Cron-triggered (see vercel.json). Two video-maintenance tasks bundled in
// one handler, same cron-budget reasoning as the billing cron
// (app/api/internal/billing/retry-failed-provisioning) — Vercel's Hobby
// plan caps this project at 2 scheduled jobs and both are spoken for.
//
// Task 1 — refreshExpiringVideoUrls: keeps COMPLETED videos' HeyGen URLs
// from silently going stale.
//
// Task 2 — sweepStuckGenerations: reconciles any PENDING/PROCESSING video
// whose completion webhook was missed, so it doesn't sit stuck forever with
// nothing ever checking back on it. See that function's own comment.
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urlRefresh = await refreshExpiringVideoUrls();
  const stuckSweep = await sweepStuckGenerations();
  return NextResponse.json({ urlRefresh, stuckSweep });
}
