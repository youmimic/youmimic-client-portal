import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { BackgroundMediaError, backgroundUploadTokenOptions } from "@/lib/backgrounds/media";

// Issues a short-lived token so the browser can upload a background photo or
// video straight to Blob (Functions only accept 4.5 MB bodies). Only token
// requests from a signed-in user are served: no upload-completed callback is
// configured, and the finished file is registered (and re-checked) by
// POST /api/dashboard/media/background.
export async function POST(req: Request) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const userId = guard.session.user.id;

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload request." }, { status: 400 });
  }
  if (body?.type !== "blob.generate-client-token") {
    return NextResponse.json({ error: "Unsupported upload request." }, { status: 400 });
  }

  const rateLimit = await checkRateLimit({ key: `upload-background:user:${userId}`, limit: 40, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => backgroundUploadTokenOptions(userId, pathname),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BackgroundMediaError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("Background upload token failed:", err);
    return NextResponse.json({ error: "Couldn't start the upload. Please try again." }, { status: 500 });
  }
}
