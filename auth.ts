// auth.ts
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { userHasActiveSubscription } from "@/lib/subscription";

class InvalidLoginError extends CredentialsSignin {
  code = "invalid_credentials";
}

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
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
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          throw new InvalidLoginError();
        }

        const { email, password } = parsed.data;

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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as { roles?: string[] }).roles ?? [];
        token.isEmailVerified =
          (user as { isEmailVerified?: boolean }).isEmailVerified ?? false;

        // Populate subscription state at sign-in so proxy.ts can read from
        // the token instead of querying the DB on every /dashboard/bookings request.
        // Checks both personal (CREATOR) and owned-enterprise (ENTERPRISE) subscriptions.
        const userId = user.id;
        if (userId) {
          token.hasActiveSubscription = await userHasActiveSubscription(userId);
        } else {
          token.hasActiveSubscription = false;
        }
      }

      // Re-query subscription when the client explicitly requests a session
      // refresh (trigger === "update"), e.g. from the post-checkout success page.
      // Uses the same query as sign-in so the proxy gate stays consistent.
      // Fail closed: if token.id is absent, leave hasActiveSubscription unchanged.
      if (trigger === "update") {
        const userId = token.id as string | undefined;
        if (userId) {
          token.hasActiveSubscription = await userHasActiveSubscription(userId);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.isEmailVerified = Boolean(token.isEmailVerified);
        // Undefined on tokens issued before this field was added → fail closed (false).
        session.user.hasActiveSubscription = Boolean(token.hasActiveSubscription);
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
