import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard"];

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) =>
      nextUrl.pathname === prefix ||
      nextUrl.pathname.startsWith(prefix + "/"),
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
