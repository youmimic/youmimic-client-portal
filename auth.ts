// auth.ts
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Prisma } from "@/app/generated/prisma/client";
import { SubscriptionStatus } from "@/app/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as { roles?: string[] }).roles ?? [];
        token.isEmailVerified =
          (user as { isEmailVerified?: boolean }).isEmailVerified ?? false;

        // Populate subscription state at sign-in so proxy.ts can read from
        // the token instead of querying the DB on every /dashboard/bookings request.
        const userId = user.id;
        if (userId) {
          const activeSub = await prisma.subscription.findFirst({
            where: {
              userId,
              status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] },
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });
          token.hasActiveSubscription = activeSub !== null;
        } else {
          token.hasActiveSubscription = false;
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
