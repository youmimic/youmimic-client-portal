import { NextResponse } from "next/server";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkUrlIsSafeToFetch } from "@/lib/media/safe-fetch";
import { computeCropBox, parseAspectRatio } from "@/lib/media/crop";
import { cropImageSchema } from "@/lib/validations/media";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 15MB
const FETCH_TIMEOUT_MS = 10_000;

// Takes a user-pasted image link plus a chosen focal point and project
// aspect ratio, crops it server-side to exactly that ratio, and re-hosts
// the result on Vercel Blob — so the scene's mediaUrl points at an
// already-correctly-cropped image by the time it reaches HeyGen, which
// only ever center-crops and has no field for a custom focal point. See
// components/dashboard/project/image-crop-picker.tsx for the UI that calls
// this.
export async function POST(req: Request) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const rateLimit = await checkRateLimit({
    key: `crop-image:user:${session.user.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many image edits. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = cropImageSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { sourceUrl, aspectRatio, focusX, focusY } = parsed.data;

  const targetRatio = parseAspectRatio(aspectRatio);
  if (!targetRatio) {
    return NextResponse.json({ error: "Unsupported aspect ratio." }, { status: 422 });
  }

  // The one real security boundary here: this route makes OUR server fetch
  // a URL the client supplied, so it must never be pointed at internal/
  // private infrastructure (see lib/media/safe-fetch.ts).
  const safety = await checkUrlIsSafeToFetch(sourceUrl);
  if (!safety.ok) {
    return NextResponse.json({ error: safety.error }, { status: 422 });
  }

  let sourceBuffer: Buffer;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(sourceUrl, { signal: controller.signal, redirect: "follow" });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Couldn't fetch that image (status ${res.status}).` }, { status: 422 });
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "That link doesn't point to an image." }, { status: 422 });
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "That image is too large (max 15MB)." }, { status: 422 });
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "That image is too large (max 15MB)." }, { status: 422 });
    }
    sourceBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError" ? "Timed out fetching that image." : "Couldn't fetch that image.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const image = sharp(sourceBuffer, { failOn: "none" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: "Couldn't read that image." }, { status: 422 });
    }

    const box = computeCropBox(metadata.width, metadata.height, targetRatio, focusX, focusY);
    const cropped = await image.extract(box).jpeg({ quality: 90 }).toBuffer();

    const blob = await put(`scene-crops/${session.user.id}/${Date.now()}.jpg`, cropped, {
      access: "public",
      contentType: "image/jpeg",
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Image crop failed:", err);
    return NextResponse.json({ error: "Couldn't process that image." }, { status: 500 });
  }
}
