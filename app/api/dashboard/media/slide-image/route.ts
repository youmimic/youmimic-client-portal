import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { normaliseSlideImage, SlideImageError, storeSlideImage } from "@/lib/slides/images";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Adds or replaces a scene's slide image by hand (imports create them
// automatically). Returns the stored image; the client then saves its id on
// the scene through the normal scene update, which re-checks ownership.
export async function POST(req: Request) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const userId = guard.session.user.id;

  const rateLimit = await checkRateLimit({ key: `upload-slide:user:${userId}`, limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let file: File | null;
  try {
    const value = (await req.formData()).get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 422 });
  }
  if (!file) return NextResponse.json({ error: "No file was uploaded." }, { status: 422 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Slide images must be PNG, JPEG or WebP." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large (max 10MB)." }, { status: 422 });
  }

  try {
    const image = await normaliseSlideImage(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(await storeSlideImage(userId, image));
  } catch (err) {
    if (err instanceof SlideImageError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("Slide image upload failed:", err);
    return NextResponse.json({ error: "Couldn't save that image. Please try again." }, { status: 500 });
  }
}
