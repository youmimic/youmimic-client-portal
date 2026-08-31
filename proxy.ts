import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export const proxy = auth(async (req) => {
  const { nextUrl } = req;
  const { pathname } = nextUrl;
  const session = req.auth;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix),
  );

  if (isProtected && !session) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session?.user) {
    const { user } = session;

    // Suspended users cannot access any protected route.
    // isSuspended is stamped into the JWT at sign-in and refreshed on update().
    // Suspended users are also blocked at the authorize() level, so this gate
    // catches sessions that were active before suspension was applied.
    if (isProtected && user.isSuspended) {
      const url = new URL("/suspended", nextUrl.origin);
      url.searchParams.set("reason", "account");
      return NextResponse.redirect(url);
    }

    // Same idea, but for enterprise-level suspension: catches sessions that
    // logged in before their enterprise was suspended (authorize() blocks new
    // logins, but an existing JWT is only re-checked on refresh, same as
    // isSuspended above).
    if (isProtected && user.isEnterpriseSuspended) {
      const url = new URL("/suspended", nextUrl.origin);
      url.searchParams.set("reason", "enterprise");
      return NextResponse.redirect(url);
    }

    // Admin routes require an adminRole. Authenticated users without one are
    // sent back to their dashboard rather than shown a 404 or an error page.
    if (matchesPrefix(pathname, "/admin") && !user.adminRole) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }

    // requireEmailVerified: /dashboard/avatars and /dashboard/videos both
    // require a verified email address — a video can only exist if it was
    // generated from an avatar, which already required verification, so
    // this is consistency (an unverified user can't have any videos to see
    // anyway) rather than a new restriction.
    if (
      (matchesPrefix(pathname, "/dashboard/avatars") ||
        matchesPrefix(pathname, "/dashboard/videos")) &&
      !user.isEmailVerified
    ) {
      const url = new URL("/verify-email", nextUrl.origin);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // requireSubscription: /dashboard/bookings and the Avatar Studio
    // (/dashboard/avatars/[id]/studio) both require an active subscription.
    // hasActiveSubscription is written into the JWT at sign-in; undefined on
    // pre-migration tokens which are treated as false (fail closed).
    const requiresSubscription =
      matchesPrefix(pathname, "/dashboard/bookings") ||
      /^\/dashboard\/avatars\/[^/]+\/studio(\/|$)/.test(pathname);

    if (requiresSubscription && !user.hasActiveSubscription) {
      const url = new URL("/dashboard/billing", nextUrl.origin);
      url.searchParams.set("reason", "subscription-required");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
