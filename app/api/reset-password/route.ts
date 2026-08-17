// app/api/reset-password/route.ts
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: `reset-password:ip:${ip}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = resetPasswordSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { id: true, userId: true, used: true, expiresAt: true },
  });

  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Invalid or expired reset link" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    // Atomic conditional claim: only the request that actually flips
    // used false -> true proceeds to update the password. A concurrent
    // duplicate submit (double-click, replay) sees count === 0 and is
    // rejected instead of hashing/applying a second time. Same pattern as
    // lib/invites/accept-invite.ts.
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: record.id, used: false },
      data: { used: true },
    });

    if (claim.count === 0) {
      return null;
    }

    // A reset link is at least as strong proof of email ownership as the
    // existing email-verification flow, so a successful reset also clears
    // any outstanding "please verify your email" block.
    // sessionVersion increment forces every other active session/device to
    // re-authenticate on its next token refresh — same mechanism admins use
    // via POST /api/admin/users/[id]/revoke-sessions.
    return tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        emailVerified: true,
        sessionVersion: { increment: 1 },
      },
      select: { id: true },
    });
  });

  if (!result) {
    return NextResponse.json(
      { error: "Invalid or expired reset link" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
