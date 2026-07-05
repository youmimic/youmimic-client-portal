// next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      isEmailVerified: boolean;
      hasActiveSubscription: boolean;
      adminRole: string | null;
      isSuspended: boolean;
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roles: string[];
    isEmailVerified: boolean;
    adminRole: string | null;
    isSuspended: boolean;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roles?: string[];
    isEmailVerified?: boolean;
    hasActiveSubscription?: boolean;
    adminRole?: string | null;
    isSuspended?: boolean;
    sessionVersion?: number;
  }
}
