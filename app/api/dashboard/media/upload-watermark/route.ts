import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { checkRateLimit } from "@/lib/rate-limit";

// HeyGen's watermark.image field only documents PNG or JPEG support (see
// lib/heygen.ts's createHeyGenStudioVideo) — accepting anything else here
// would just fail later at render time, so it's rejected upfront instead.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);
// Generous for a logo (not a photo): keeps this well under Vercel's request
// body limits without needing a separate large-file path.
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// A plain file upload (not a pasted URL, unlike the scene-media crop route)
// re-hosted on Vercel Blob, so the project just stores a URL. No cropping or
// resizing here — HeyGen scales the watermark itself via the `scale` field.
export async function POST(req: Request) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const rateLimit = await checkRateLimit({
    key: `upload-watermark:user:${session.user.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let file: File | null;
  try {
    const formData = await req.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 422 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 422 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Watermark images must be PNG or JPEG." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large (max 5MB)." }, { status: 422 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : "jpg";
    const blob = await put(`watermarks/${session.user.id}/${Date.now()}.${ext}`, buffer, {
      access: "public",
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Watermark upload (Blob) failed:", err);
    return NextResponse.json({ error: "Couldn't save that image. Please try again." }, { status: 500 });
  }
}
