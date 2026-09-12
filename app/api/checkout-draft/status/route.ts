import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Polled by the /checkout/success page — deliberately returns nothing but a
// coarse status. The success page itself is UX-only per the spec: it must
// never be the source of truth for granting access, so this endpoint can't
// be used to infer that either — no email, name, token, or Stripe id is
// ever returned here.
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const draft = await prisma.checkoutDraft.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { status: true },
  });

  if (!draft) {
    // Could be a genuinely unknown session id, or the webhook simply hasn't
    // linked it yet (very unlikely given the session id is stored before
    // redirecting to Stripe, but not impossible under heavy write lag) —
    // the client treats "pending" and "not found yet" identically and just
    // keeps polling until it either resolves or times out.
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({ status: draft.status });
}
