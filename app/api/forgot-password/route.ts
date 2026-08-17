// app/api/forgot-password/route.ts
import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { sendForgotPasswordEmail } from "@/lib/mailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Always returns the same generic response whether or not the email
// belongs to an account — never confirms/denies account existence here.
const GENERIC_RESPONSE = {
  message: "If an account exists for that email, a reset link has been sent.",
};

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: `forgot-password:ip:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    // Same generic response as everything else in this route — a rate-limit
    // response with a distinct shape would leak that the endpoint treats
    // this request differently, which is exactly the enumeration risk the
    // GENERIC_RESPONSE pattern elsewhere in this file already guards against.
    return NextResponse.json(GENERIC_RESPONSE, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = forgotPasswordSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });

  // No account for this email — return the same success response as a real
  // send, just without doing one. Prevents using this endpoint to enumerate
  // which emails have accounts.
  if (!user) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  // Invalidate any previously-issued, still-unused reset links for this
  // user before issuing a new one — same pattern as email verification
  // tokens in lib/auth/register-user.ts.
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt, used: false },
    }),
  ]);

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    throw new Error("NEXTAUTH_URL is not configured");
  }

  const resetUrl = new URL("/reset-password", appUrl);
  resetUrl.searchParams.set("token", token);

  try {
    await sendForgotPasswordEmail({ to: email, resetUrl: resetUrl.toString() });
  } catch (err) {
    // Same tolerant handling as the rest of this app's transactional email
    // calls (e.g. invite emails) — a delivery failure shouldn't surface a
    // 500 to the client or reveal anything about whether the account exists.
    console.error("Forgot-password email failed:", err);
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
