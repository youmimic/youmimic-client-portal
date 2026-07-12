// app/api/verify-email/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: true },
  });

  await prisma.emailVerificationToken.update({
    where: { id: record.id },
    data: { used: true },
  });

  const loginUrl = new URL("/login", process.env.NEXTAUTH_URL);
  loginUrl.searchParams.set("verified", "1");

  const callbackUrl = searchParams.get("callbackUrl");
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
  }

  return NextResponse.redirect(loginUrl);
}
