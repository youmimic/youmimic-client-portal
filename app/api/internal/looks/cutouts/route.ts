import { NextResponse } from "next/server";
import { processCutoutQueue } from "@/lib/backgrounds/cutouts";

// Cron-triggered every 10 minutes (vercel.json; the project is on Vercel Pro,
// which allows that). Works through the cut-out queue: collects finished
// transparent clips and starts a few queued ones (lib/backgrounds/cutouts.ts).
// Vercel invokes crons with GET plus "Authorization: Bearer <CRON_SECRET>";
// POST is kept for manual authenticated calls.
export const maxDuration = 300;

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processCutoutQueue());
  } catch (err) {
    console.error("Cut-out queue run failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
