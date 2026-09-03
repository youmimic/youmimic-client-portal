import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHeyGenVideoStatus, HeyGenApiError } from "@/lib/heygen";
import { estimatedCostCents } from "@/lib/heygen/pricing";
import { reconcileCredits, releaseReservationForVideo } from "@/lib/usage/ledger";
import type { VideoGenerationStatus } from "@/app/generated/prisma/enums";

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

function mapRemoteStatus(status: string): VideoGenerationStatus {
  switch (status) {
    case "completed":
      return "COMPLETED" as VideoGenerationStatus;
    case "failed":
      return "FAILED" as VideoGenerationStatus;
    case "processing":
      return "PROCESSING" as VideoGenerationStatus;
    default:
      return "PENDING" as VideoGenerationStatus;
  }
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
    select: { id: true, lastWebhookEventId: true, engine: true },
  });
  if (!local) {
    return NextResponse.json({ received: true });
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
  try {
    const remote = await getHeyGenVideoStatus(videoId);
    const mapped = mapRemoteStatus(remote.status);

    // duration/cost only meaningful once actually completed — HeyGen's
    // status response has no cost field at all, so cost is always derived
    // from duration x this row's own engine rate (see lib/heygen/pricing.ts).
    const isCompleted = mapped === "COMPLETED";
    const durationSeconds = isCompleted ? (remote.duration ?? undefined) : undefined;

    await prisma.generatedVideo.update({
      where: { id: local.id },
      data: {
        status: mapped,
        videoUrl: remote.video_url ?? undefined,
        thumbnailUrl: remote.thumbnail_url ?? undefined,
        errorMessage: mapped === "FAILED" ? (remote.error?.message ?? "Video generation failed") : undefined,
        completedAt: mapped === "COMPLETED" || mapped === "FAILED" ? new Date() : undefined,
        lastWebhookEventId: eventId ?? undefined,
        durationSeconds,
        estimatedCostCents:
          durationSeconds !== undefined
            ? estimatedCostCents(local.engine, durationSeconds)
            : undefined,
      },
    });

    if (isCompleted && durationSeconds !== undefined) {
      await reconcileCredits({ videoId: local.id, engine: local.engine, actualDurationSeconds: durationSeconds });
    } else if (mapped === "FAILED") {
      await releaseReservationForVideo(local.id);
    }
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Unknown error";
    console.error(`Failed to reconcile HeyGen video ${videoId} after webhook:`, message);
    // Still 200 — HeyGen shouldn't retry-storm us; the manual refresh
    // fallback in the UI covers this case.
  }

  return NextResponse.json({ received: true });
}
