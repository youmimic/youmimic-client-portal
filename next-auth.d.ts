// next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      isEmailVerified: boolean;
      hasActiveSubscription: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roles: string[];
    isEmailVerified: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roles?: string[];
    isEmailVerified?: boolean;
    hasActiveSubscription?: boolean;
  }
}
