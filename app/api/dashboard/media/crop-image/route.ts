import { NextResponse } from "next/server";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkUrlIsSafeToFetch } from "@/lib/media/safe-fetch";
import { computeCropBox, parseAspectRatio } from "@/lib/media/crop";
import { cropImageSchema } from "@/lib/validations/media";

// Not a platform limit — this is our own safety cap on the server-side
// fetch of a user-supplied URL. It's unrelated to Vercel's 4.5MB request/
// response body limit, which only applies to data going through the
// function's own HTTP request/response, not an outbound fetch to a third
// party. Vercel's function memory (2-4GB) comfortably handles files well
// beyond this; raised from an initial 15MB after a real source image
// legitimately exceeded that.
const MAX_SOURCE_BYTES = 40 * 1024 * 1024; // 40MB
const FETCH_TIMEOUT_MS = 10_000;
// No output video is ever wider than 4K (3840px) — see
// lib/heygen/pricing.ts's 4K support — so a source image larger than this
// is downscaled before cropping. Protects memory/processing time against
// an unnecessarily huge source (e.g. an 8000x6000 screenshot) without
// affecting any realistic photo.
const MAX_SOURCE_DIMENSION = 4096;

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
      return NextResponse.json({ error: "That image is too large (max 40MB)." }, { status: 422 });
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "That image is too large (max 40MB)." }, { status: 422 });
    }
    sourceBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError" ? "Timed out fetching that image." : "Couldn't fetch that image.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let cropped: Buffer;
  try {
    let image = sharp(sourceBuffer, { failOn: "none" });
    let metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: "Couldn't read that image." }, { status: 422 });
    }

    if (metadata.width > MAX_SOURCE_DIMENSION || metadata.height > MAX_SOURCE_DIMENSION) {
      image = sharp(sourceBuffer, { failOn: "none" }).resize({
        width: MAX_SOURCE_DIMENSION,
        height: MAX_SOURCE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
      // Dimensions change after resize — re-read them rather than estimate,
      // since fit: "inside" preserves aspect ratio and rounds to whole
      // pixels.
      const resizedBuffer = await image.toBuffer();
      image = sharp(resizedBuffer, { failOn: "none" });
      metadata = await image.metadata();
    }

    const box = computeCropBox(metadata.width!, metadata.height!, targetRatio, focusX, focusY);
    cropped = await image.extract(box).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    console.error("Image crop (decode/resize/extract) failed:", err);
    return NextResponse.json({ error: "Couldn't process that image — it may be corrupted or an unsupported format." }, { status: 422 });
  }

  try {
    const blob = await put(`scene-crops/${session.user.id}/${Date.now()}.jpg`, cropped, {
      access: "public",
      contentType: "image/jpeg",
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Image crop (Blob upload) failed:", err);
    return NextResponse.json({ error: "Cropped the image, but couldn't save it. Please try again." }, { status: 500 });
  }
}
