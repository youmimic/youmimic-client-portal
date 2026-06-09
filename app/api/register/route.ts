// app/api/register/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import resend from "@/lib/resend";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : null;

    if (!confirmPassword) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: {
            confirmPassword: ["Confirm password is required"],
          },
        },
        { status: 400 },
      );
    }

    if (
      typeof body.password !== "string" ||
      body.password !== confirmPassword
    ) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: {
            confirmPassword: ["Passwords do not match"],
          },
        },
        { status: 400 },
      );
    }

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { name, email, password } = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "User already exists",
          fieldErrors: {
            email: ["An account with this email already exists"],
          },
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerified: false,
      },
    });

    await prisma.emailVerificationToken.deleteMany({
      where: {
        userId: user.id,
        used: false,
      },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        used: false,
      },
    });

    const verifyUrl = `${process.env.NEXTAUTH_URL}/api/verify-email?token=${token}`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "welcome@youmimic.com",
      to: email,
      subject: "Verify your email",
      html: `
        <p>Hello ${name},</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });

    return NextResponse.json(
      { message: "User registered successfully. Please verify your email." },
      { status: 201 },
    );
  } catch (error) {
    console.error("Register error:", error);

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
