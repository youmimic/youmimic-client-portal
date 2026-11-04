// next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      isEmailVerified: boolean;
      hasActiveSubscription: boolean;
      hasAcceptedLegal: boolean;
      adminRole: string | null;
      isSuspended: boolean;
      isEnterpriseSuspended: boolean;
      sessionVersion: number;
      clientModeEnabled: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roles: string[];
    isEmailVerified: boolean;
    hasAcceptedLegal: boolean;
    adminRole: string | null;
    isSuspended: boolean;
    isEnterpriseSuspended: boolean;
    sessionVersion: number;
    clientModeEnabled: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roles?: string[];
    isEmailVerified?: boolean;
    hasActiveSubscription?: boolean;
    hasAcceptedLegal?: boolean;
    adminRole?: string | null;
    isSuspended?: boolean;
    isEnterpriseSuspended?: boolean;
    sessionVersion?: number;
    clientModeEnabled?: boolean;
  }
}
