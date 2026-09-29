import { NextResponse } from "next/server";
import { auth } from "@/auth";

// `auth` is overloaded (plain session getter, middleware wrapper, handler
// wrapper) — `ReturnType<typeof auth>` alone resolves to the wrong overload
// (NextMiddleware). Routing through a function that calls it with no
// arguments pins down the actual no-args overload's return type instead;
// it exists only for that, never called.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getSession() {
  return auth();
}
type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type SessionGuard =
  | { ok: true; session: AuthSession }
  | { ok: false; response: NextResponse };

// proxy.ts's requireAcceptedLegal/requireEmailVerified gates only protect
// page navigation — a direct call to the underlying API route was never
// checked against either, regardless of how the account was created. This
// is the API-layer equivalent, meant to replace the bare
// `const session = await auth(); if (!session?.user) {...}` check already
// inline in every dashboard/bookings route, not to duplicate it.
//
// requireEmailVerified is opt-in per call site — pass it for a route whose
// corresponding page is under proxy.ts's /dashboard/avatars or
// /dashboard/videos prefixes; omit it for routes like bookings or billing
// that proxy.ts never gated on email verification either. Subscription
// entitlement is intentionally NOT included here: every sensitive route
// that needs it already does its own fresh `userHasActiveSubscription`
// check (see app/api/bookings/route.ts, generate-video/route.ts, etc.),
// so folding it in here would duplicate rather than close a gap.
export async function requireDashboardSession(
  opts: { requireEmailVerified?: boolean } = {},
): Promise<SessionGuard> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // No admin exemption — mirrors proxy.ts's requireAcceptedLegal exactly.
  // An admin-created account (which never collects consent at all) is
  // exactly the case this needs to catch, not exempt.
  if (!session.user.hasAcceptedLegal) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You must accept the Terms and Privacy Policy before continuing.", code: "LEGAL_NOT_ACCEPTED" },
        { status: 403 },
      ),
    };
  }

  // Admin exemption here mirrors proxy.ts's requireEmailVerified gate.
  if (opts.requireEmailVerified && !session.user.isEmailVerified && !session.user.adminRole) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Please verify your email address before continuing.", code: "EMAIL_NOT_VERIFIED" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}
