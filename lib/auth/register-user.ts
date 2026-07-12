// lib/auth/register-user.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { sendVerifyEmail } from "@/lib/mailer";
import { claimInviteAndCreateMembership } from "@/lib/invites/accept-invite";

type RegisterResult =
  | { ok: true; emailVerified: boolean; joinedEnterpriseName: string | null }
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

  const rawInviteToken = body.inviteToken;
  const inviteToken =
    typeof rawInviteToken === "string" && rawInviteToken.length > 0
      ? rawInviteToken
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

  // Trust for skipping email verification comes from the Invite row itself,
  // never from the client — a client-supplied "skip verification" flag would
  // let anyone bypass verification on the public /signup form too. Clicking
  // a still-pending invite link addressed to this exact email is treated as
  // equivalent proof of inbox ownership.
  let verifiedViaInvite = false;
  if (inviteToken) {
    const invite = await prisma.invite.findUnique({
      where: { token: inviteToken },
      select: { email: true, status: true },
    });
    verifiedViaInvite = !!invite && invite.status === "pending" && invite.email === email;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const { user, joinedEnterpriseName } = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerified: verifiedViaInvite,
      },
      select: { id: true, email: true, name: true },
    });

    if (!verifiedViaInvite) {
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
    }

    // Invite eligibility (pending status + matching email) was already
    // proven above to decide verifiedViaInvite. Accepting it here, in the
    // same transaction as account creation, means a brand-new invitee
    // never has to make a second stop at /invite/[token] after logging in
    // — membership already exists by the time they log in.
    let joinedEnterpriseName: string | null = null;
    if (verifiedViaInvite && inviteToken) {
      const claimResult = await claimInviteAndCreateMembership(
        tx,
        inviteToken,
        createdUser.id,
      );
      if (claimResult.status === "accepted") {
        joinedEnterpriseName = claimResult.enterpriseName;
      }
      // If the claim lost a race (invite was cancelled/accepted between the
      // pre-transaction check and now), the account is still created and
      // verified — the caller falls back to sending them through
      // /invite/[token] after login, which will show the correct state.
    }

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

    return { user: createdUser, joinedEnterpriseName };
  });

  if (!verifiedViaInvite) {
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
  }

  return { ok: true, emailVerified: verifiedViaInvite, joinedEnterpriseName };
}
