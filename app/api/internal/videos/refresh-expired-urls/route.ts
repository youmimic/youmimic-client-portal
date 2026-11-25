import { NextResponse } from "next/server";
import { refreshExpiringVideoUrls, sweepStuckGenerations } from "@/lib/heygen/generate-video";
import { removeSlideImagesAfterRender } from "@/lib/slides/images";

// Cron-triggered (see vercel.json). Video-maintenance tasks bundled in one
// handler, same cron-budget reasoning as the billing cron
// (app/api/internal/billing/retry-failed-provisioning) — Vercel's Hobby
// plan caps this project at 2 scheduled jobs and both are spoken for.
//
// Task 1 — refreshExpiringVideoUrls: keeps COMPLETED videos' HeyGen URLs
// from silently going stale.
//
// Task 2 — sweepStuckGenerations: reconciles any PENDING/PROCESSING video
// whose completion webhook was missed, so it doesn't sit stuck forever with
// nothing ever checking back on it. See that function's own comment.
//
// Task 3 — removeSlideImagesAfterRender: deletes document slide images a day
// after the last video that used them finished (privacy). Runs after task 2
// so renders it just completed are seen with their real status. A failure
// here is logged and reported, never allowed to hide tasks 1 and 2's results.
//
// Vercel invokes crons with GET ("Vercel makes an HTTP GET request to your
// project's production deployment URL", vercel.com/docs/cron-jobs), sending
// "Authorization: Bearer <CRON_SECRET>". Until 2026-11-25 this route only
// exported POST, so the scheduled call got 405 and never ran. POST is kept
// for manual authenticated calls.
export async function GET(req: Request) {
  return runVideoMaintenance(req);
}

export async function POST(req: Request) {
  return runVideoMaintenance(req);
}

async function runVideoMaintenance(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urlRefresh = await refreshExpiringVideoUrls();
  const stuckSweep = await sweepStuckGenerations();
  const slideCleanup = await removeSlideImagesAfterRender().catch((err) => {
    console.error("Slide image removal after render failed:", err);
    return { error: "failed" as const };
  });
  return NextResponse.json({ urlRefresh, stuckSweep, slideCleanup });
}
