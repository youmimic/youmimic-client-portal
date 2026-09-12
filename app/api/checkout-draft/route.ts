import { NextResponse } from "next/server";
import { createCheckoutDraft } from "@/lib/checkout/create-draft";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public, unauthenticated endpoint — the whole point of this route is to
// let a guest start a Mid Market / Small Business purchase before they have
// an account. See lib/checkout/create-draft.ts for the actual validation
// and eligibility rules; this handler is just the HTTP boundary.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: `checkout-draft:ip:${ip}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createCheckoutDraft(body);

  if (!result.ok) {
    const status =
      result.code === "VALIDATION"
        ? 422
        : result.code === "EMAIL_IN_USE"
          ? 409
          : 400;
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status },
    );
  }

  return NextResponse.json({ draftId: result.draftId });
}
