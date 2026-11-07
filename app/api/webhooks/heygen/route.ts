import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reconcileVideoWithHeyGen } from "@/lib/heygen/generate-video";

// HeyGen signs the raw request body with HMAC-SHA256 using the endpoint's
// signing secret, sent as the Heygen-Signature header (hex digest), plus a
// Heygen-Timestamp header. Verified against the raw bytes before any JSON
// parsing — whitespace/key-order differences would otherwise break the HMAC.
//
// Per HeyGen's own docs, Heygen-Timestamp is defense-in-depth only, not a
// real replay defense on its own: the signature covers the request body,
// not the timestamp header, so a captured (body, signature) pair can be
// replayed indefinitely with a fresh timestamp attached without breaking
// verification. Heygen-Event-Id — deduped below — is the documented
// *primary* defense.
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

interface HeyGenWebhookEvent {
  event_id: string;
  event_type: string;
  event_data: { video_id?: string };
  created_at: string;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.HEYGEN_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("HEYGEN_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("heygen-signature");
  const timestamp = req.headers.get("heygen-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skewSeconds) || skewSeconds > MAX_TIMESTAMP_SKEW_SECONDS) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 400 });
  }

  const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
  if (!timingSafeEqualHex(signature, expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventId = req.headers.get("heygen-event-id");

  let event: HeyGenWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const videoId = event.event_data?.video_id;
  if (!videoId) {
    // Not a video-related event this app cares about — accept and move on.
    return NextResponse.json({ received: true });
  }

  const local = await prisma.generatedVideo.findUnique({
    where: { heygenVideoId: videoId },
    select: { id: true, lastWebhookEventId: true, engine: true, resolution: true },
  });
  if (!local) {
    // The generation code now creates its GeneratedVideo row before ever
    // calling HeyGen (lib/heygen/generate-video.ts, lib/projects/generate.ts)
    // specifically so this should never happen for a real, successfully
    // started job — but the narrow gap between "HeyGen's response with
    // video_id reaches us" and "our own heygenVideoId update commits" can't
    // be fully eliminated, so a genuinely early webhook event could still
    // race it. Returning non-2xx (rather than swallowing it as {received:
    // true}) asks HeyGen to retry delivery, which should succeed on the
    // next attempt once that update has committed — normally milliseconds
    // later. If every retry is exhausted before a row ever shows up (e.g.
    // this id is simply unrecognized), the stuck-generation sweep
    // (lib/heygen/generate-video.ts's sweepStuckGenerations) is the final
    // backstop regardless.
    return NextResponse.json({ error: "No matching video yet — please retry" }, { status: 404 });
  }

  // Redelivery of an event we already fully reconciled — skip the HeyGen
  // re-fetch entirely rather than doing (harmless but wasteful) repeat
  // work, and to keep response time well under HeyGen's 10s/2xx window on
  // retry storms. Only short-circuits on an *exact* event-id match, so a
  // retry following a genuine failure mid-processing (before
  // lastWebhookEventId was ever set) is still reprocessed.
  if (eventId && eventId === local.lastWebhookEventId) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Treat the webhook purely as a "go check now" signal and re-fetch
  // authoritative state from HeyGen, rather than trusting webhook payload
  // fields directly — matches HeyGen's own guidance for failure events, and
  // means success/fail are handled identically here.
  const result = await reconcileVideoWithHeyGen(
    { id: local.id, heygenVideoId: videoId, engine: local.engine, resolution: local.resolution },
    { webhookEventId: eventId ?? undefined },
  );
  if (!result.ok) {
    console.error(`Failed to reconcile HeyGen video ${videoId} after webhook:`, result.error);
    // Still 200 — HeyGen shouldn't retry-storm us; the manual refresh
    // fallback in the UI covers this case.
  }

  return NextResponse.json({ received: true });
}
