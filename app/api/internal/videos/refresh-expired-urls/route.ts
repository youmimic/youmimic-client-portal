import { NextResponse } from "next/server";
import { refreshExpiringVideoUrls } from "@/lib/heygen/generate-video";

// Cron-triggered (see vercel.json) sweep that keeps COMPLETED videos'
// HeyGen URLs from silently going stale — see refreshExpiringVideoUrls for
// why this is separate from the PENDING/PROCESSING status-refresh route.
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshExpiringVideoUrls();
  return NextResponse.json(result);
}
