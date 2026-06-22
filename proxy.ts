import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard"];

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

    // requireEmailVerified: /dashboard/avatars requires a verified email address
    if (matchesPrefix(pathname, "/dashboard/avatars") && !user.isEmailVerified) {
      const url = new URL("/verify-email", nextUrl.origin);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // requireSubscription: /dashboard/bookings requires an active subscription.
    // hasActiveSubscription is written into the JWT at sign-in; undefined on
    // pre-migration tokens which are treated as false (fail closed).
    if (
      matchesPrefix(pathname, "/dashboard/bookings") &&
      !user.hasActiveSubscription
    ) {
      const url = new URL("/pricing", nextUrl.origin);
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
