import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { resend } from "@/lib/resend";

export async function POST(req: Request) {
  const { name, email, password } = await req.json();
  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      emailVerified: false,
    },
  });

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const verifyUrl = `${process.env.BASE_URL}/api/verify-email?token=${token}`;

  await resend.emails.send({
    from: process.env.FROM_EMAIL!,
    to: normalizedEmail,
    subject: "Verify your email",
    html: `<p>Verify your email by clicking <a href="${verifyUrl}">this link</a>.</p>`,
  });

  return NextResponse.json({ ok: true });
}
