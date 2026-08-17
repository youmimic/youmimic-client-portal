// auth.ts
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { userHasActiveSubscription } from "@/lib/subscription";
import { getSuspendedEnterpriseName } from "@/lib/enterprise-status";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

class InvalidLoginError extends CredentialsSignin {
  code = "invalid_credentials";
}

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

class AccountSuspendedError extends CredentialsSignin {
  code = "account_suspended";
}

class EnterpriseSuspendedError extends CredentialsSignin {
  code = "enterprise_suspended";
}

class RateLimitedError extends CredentialsSignin {
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          throw new InvalidLoginError();
        }

        const { email, password } = parsed.data;

        // Two dimensions: per-IP catches a single attacker spraying many
        // emails; per-email catches a distributed/rotating-IP attack
        // targeting one account. Checked before the DB lookup/bcrypt compare
        // below so a brute-force run doesn't pay for either once limited.
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

        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash,
        );

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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = user.roles ?? [];
        token.isEmailVerified = user.isEmailVerified ?? false;
        token.adminRole = user.adminRole ?? null;
        token.isSuspended = user.isSuspended ?? false;
        token.isEnterpriseSuspended = false;
        token.sessionVersion = user.sessionVersion ?? 1;

        // Populate subscription state at sign-in so proxy.ts can gate
        // /dashboard/bookings without a DB call on every request.
        const userId = user.id;
        if (userId) {
          token.hasActiveSubscription = await userHasActiveSubscription(userId);
        } else {
          token.hasActiveSubscription = false;
        }
      }

      // Re-query mutable user state on every token re-issuance that is NOT a
      // fresh sign-in (handled above). This runs on two paths:
      //   1. Explicit session.update() call (trigger === "update") — e.g. post-checkout.
      //   2. Natural JWT refresh — Auth.js re-issues the cookie once the token's age
      //      exceeds `updateAge` (default 24 h). trigger is undefined in this case.
      //
      // Revocation design: when an admin calls POST /api/admin/users/[id]/revoke-sessions,
      // the DB sessionVersion is incremented. The user's current JWT still holds the old
      // version. On the next re-issuance (explicit update OR natural 24 h refresh),
      // this branch detects the mismatch and returns null — Auth.js clears the cookie
      // and the user must log in again. No per-request DB reads in middleware.
      const userId = token.id as string | undefined;
      if (userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            adminRole: true,
            isSuspended: true,
            sessionVersion: true,
          },
        });

        if (!dbUser) return null;

        const tokenVersion = (token.sessionVersion as number | undefined) ?? 1;
        if (dbUser.sessionVersion > tokenVersion) {
          // sessionVersion was incremented by an admin action — revoke this token.
          return null;
        }

        token.adminRole = dbUser.adminRole ?? null;
        token.isSuspended = dbUser.isSuspended;
        token.isEnterpriseSuspended = dbUser.isSuspended
          ? false // individual suspension already covers the redirect; skip the extra query
          : (await getSuspendedEnterpriseName(userId)) !== null;
        token.sessionVersion = dbUser.sessionVersion;
        token.hasActiveSubscription = await userHasActiveSubscription(userId);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.isEmailVerified = Boolean(token.isEmailVerified);
        session.user.hasActiveSubscription = Boolean(token.hasActiveSubscription);
        session.user.adminRole = (token.adminRole as string | null | undefined) ?? null;
        session.user.isSuspended = Boolean(token.isSuspended);
        session.user.isEnterpriseSuspended = Boolean(token.isEnterpriseSuspended);
        session.user.sessionVersion = (token.sessionVersion as number | undefined) ?? 1;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
