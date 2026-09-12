import { NextResponse } from "next/server";
import { updateCheckoutDraft } from "@/lib/checkout/create-draft";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public, unauthenticated endpoint — same trust model as POST /api/checkout-draft
// and /api/stripe/guest-checkout-session: knowing the draftId (an
// unguessable cuid, effectively a bearer capability, never a raw user id or
// anything else sensitive) is what authorizes acting on it, not a session.
// Used only when resuming a draft from a reminder email and the buyer
// changes something on the prefilled form before proceeding to payment
// again — see lib/checkout/create-draft.ts's updateCheckoutDraft for why
// this edits in place rather than creating a second draft.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
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

  const { draftId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await updateCheckoutDraft(draftId, body);

  if (!result.ok) {
    const status =
      result.code === "VALIDATION"
        ? 422
        : result.code === "EMAIL_IN_USE"
          ? 409
          : result.code === "NOT_FOUND"
            ? 404
            : result.code === "NOT_RESUMABLE"
              ? 409
              : 400;
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status },
    );
  }

  return NextResponse.json({ draftId: result.draftId });
}
