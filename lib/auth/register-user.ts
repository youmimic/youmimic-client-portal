// lib/auth/register-user.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { sendVerifyEmail } from "@/lib/mailer";

type RegisterResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

export async function registerUser(rawBody: unknown): Promise<RegisterResult> {
  if (!rawBody || typeof rawBody !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
    };
  }

  const body = rawBody as Record<string, unknown>;

  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : null;

  if (!confirmPassword) {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
      fieldErrors: {
        confirmPassword: ["Confirm password is required"],
      },
    };
  }

  if (typeof body.password !== "string" || body.password !== confirmPassword) {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
      fieldErrors: {
        confirmPassword: ["Passwords do not match"],
      },
    };
  }

  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const {
    name,
    email,
    password,
    acceptTerms,
    termsLinkClicked,
    accountType,
    businessName,
  } = parsed.data;

  const rawCallbackUrl = body.callbackUrl;
  const callbackUrl =
    typeof rawCallbackUrl === "string" &&
    rawCallbackUrl.startsWith("/") &&
    !rawCallbackUrl.startsWith("//")
      ? rawCallbackUrl
      : null;

  if (!acceptTerms || !termsLinkClicked) {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
      fieldErrors: {
        acceptTerms: ["You must accept the Terms and Conditions"],
        termsLinkClicked: [
          "Please open the Terms and Conditions before continuing",
        ],
      },
    };
  }

  if (accountType === "BUSINESS" && !businessName) {
    return {
      ok: false,
      status: 400,
      error: "Validation failed",
      fieldErrors: {
        businessName: ["Business name is required"],
      },
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return {
      ok: false,
      status: 409,
      error: "User already exists",
      fieldErrors: {
        email: ["An account with this email already exists"],
      },
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerified: false,
      },
      select: { id: true, email: true, name: true },
    });

    await tx.emailVerificationToken.deleteMany({
      where: { userId: createdUser.id, used: false },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: createdUser.id,
        token,
        expiresAt,
        used: false,
      },
    });

    if (accountType === "BUSINESS" && businessName) {
      // Ensure the "owner" role exists — safe to upsert idempotently.
      const ownerRole = await tx.role.upsert({
        where: { name: "owner" },
        create: { name: "owner" },
        update: {},
        select: { id: true },
      });

      const enterprise = await tx.enterprise.create({
        data: {
          name: businessName,
          ownerUserId: createdUser.id,
          status: "active",
        },
        select: { id: true },
      });

      await tx.enterpriseMember.create({
        data: {
          enterpriseId: enterprise.id,
          userId: createdUser.id,
          roleId: ownerRole.id,
        },
      });
    }

    return createdUser;
  });

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    throw new Error("NEXTAUTH_URL is not configured");
  }

  const verifyUrl = callbackUrl
    ? `${appUrl}/api/verify-email?token=${token}&callbackUrl=${encodeURIComponent(callbackUrl)}`
    : `${appUrl}/api/verify-email?token=${token}`;

  await sendVerifyEmail({
    to: user.email,
    name: user.name ?? "there",
    verifyUrl,
    idempotencyKey: `verify-email/${token}`,
  });

  return { ok: true };
}
