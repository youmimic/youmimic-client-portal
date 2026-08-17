import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { getSuspendedEnterpriseName } from "@/lib/enterprise-status";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export class InvalidLoginError extends CredentialsSignin {
  code = "invalid_credentials";
}

export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

export class AccountSuspendedError extends CredentialsSignin {
  code = "account_suspended";
}

export class EnterpriseSuspendedError extends CredentialsSignin {
  code = "enterprise_suspended";
}

export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

type UserWithRoles = Prisma.UserGetPayload<{
  include: {
    userRoles: {
      include: {
        role: true;
      };
    };
  };
}>;

// Extracted from auth.ts's Credentials authorize() callback so the core
// login gate (validation, rate limiting, account/enterprise suspension,
// password check) is testable without going through NextAuth's plumbing —
// same pattern as lib/auth/register-user.ts for registration. Return shape
// matches what NextAuth's authorize() must resolve to.
export async function authenticateUser(credentials: unknown, request: Request) {
  const parsed = loginSchema.safeParse(credentials);

  if (!parsed.success) {
    throw new InvalidLoginError();
  }

  const { email, password } = parsed.data;

  // Two dimensions: per-IP catches a single attacker spraying many emails;
  // per-email catches a distributed/rotating-IP attack targeting one
  // account. Checked before the DB lookup/bcrypt compare below so a
  // brute-force run doesn't pay for either once limited.
  const ip = getClientIp(request);
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit({
      key: `login:ip:${ip}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    }),
    checkRateLimit({
      key: `login:email:${email}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
    }),
  ]);

  if (!ipLimit.allowed || !emailLimit.allowed) {
    throw new RateLimitedError();
  }

  const user: UserWithRoles | null = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new InvalidLoginError();
  }

  if (!user.emailVerified) {
    throw new EmailNotVerifiedError();
  }

  if (user.isSuspended) {
    throw new AccountSuspendedError();
  }

  const suspendedEnterpriseName = await getSuspendedEnterpriseName(user.id);
  if (suspendedEnterpriseName) {
    throw new EnterpriseSuspendedError();
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new InvalidLoginError();
  }

  const roles = user.userRoles.map((userRole) => userRole.role.name);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isEmailVerified: user.emailVerified,
    roles,
    adminRole: user.adminRole,
    isSuspended: user.isSuspended,
    isEnterpriseSuspended: false,
    sessionVersion: user.sessionVersion,
  };
}
