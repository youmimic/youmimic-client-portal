import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateUser,
  InvalidLoginError,
  EmailNotVerifiedError,
  AccountSuspendedError,
  EnterpriseSuspendedError,
  RateLimitedError,
} from "@/lib/auth/authenticate-user";

const findUnique = vi.fn();
const compare = vi.fn();
const getSuspendedEnterpriseName = vi.fn();
const checkRateLimit = vi.fn();
const getClientIp = vi.fn();

// The real "next-auth" package transitively imports "next/server", which
// Vitest's plain Node environment can't resolve the way Next.js's own
// bundler does (that resolution is special-cased into Next's webpack/
// Turbopack config, not a standard Node export map entry). Stub out just
// the base class authenticate-user.ts's error classes extend from — the
// stub only needs to behave like a normal Error subclass for `instanceof`
// checks to work, which is all these tests rely on.
vi.mock("next-auth", () => ({
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: (...args: unknown[]) => compare(...args) },
}));
vi.mock("@/lib/enterprise-status", () => ({
  getSuspendedEnterpriseName: (...args: unknown[]) =>
    getSuspendedEnterpriseName(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: (...args: unknown[]) => getClientIp(...args),
}));

const validCredentials = {
  email: "user@example.com",
  password: "CorrectPass123",
};

const dummyRequest = new Request("http://localhost");

const baseUser = {
  id: "user-1",
  name: "Test User",
  email: "user@example.com",
  passwordHash: "hashed",
  emailVerified: true,
  isSuspended: false,
  adminRole: null,
  sessionVersion: 1,
  userRoles: [{ role: { name: "MEMBER" } }],
};

beforeEach(() => {
  findUnique.mockReset();
  compare.mockReset();
  getSuspendedEnterpriseName.mockReset();
  checkRateLimit.mockReset();
  getClientIp.mockReset();

  // Sensible defaults for the "happy path" — individual tests override
  // whichever call they're targeting.
  getClientIp.mockReturnValue("203.0.113.1");
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  getSuspendedEnterpriseName.mockResolvedValue(null);
  compare.mockResolvedValue(true);
});

describe("authenticateUser", () => {
  it("rejects malformed credentials before touching the database", async () => {
    await expect(
      authenticateUser({ email: "not-an-email" }, dummyRequest),
    ).rejects.toBeInstanceOf(InvalidLoginError);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rate-limits by IP without querying the database", async () => {
    checkRateLimit.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve({
        allowed: !key.startsWith("login:ip:"),
        retryAfterSeconds: key.startsWith("login:ip:") ? 60 : 0,
      }),
    );

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(RateLimitedError);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rate-limits by email without querying the database", async () => {
    checkRateLimit.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve({
        allowed: !key.startsWith("login:email:"),
        retryAfterSeconds: key.startsWith("login:email:") ? 60 : 0,
      }),
    );

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(RateLimitedError);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects when no account exists for the email, without leaking that distinction", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(InvalidLoginError);
  });

  it("rejects an unverified email before checking the password", async () => {
    findUnique.mockResolvedValue({ ...baseUser, emailVerified: false });

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);

    expect(compare).not.toHaveBeenCalled();
  });

  it("rejects a suspended account before checking the password", async () => {
    findUnique.mockResolvedValue({ ...baseUser, isSuspended: true });

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(AccountSuspendedError);

    expect(compare).not.toHaveBeenCalled();
  });

  it("rejects a member of a suspended enterprise before checking the password", async () => {
    findUnique.mockResolvedValue(baseUser);
    getSuspendedEnterpriseName.mockResolvedValue("Acme Inc");

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(EnterpriseSuspendedError);

    expect(compare).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password", async () => {
    findUnique.mockResolvedValue(baseUser);
    compare.mockResolvedValue(false);

    await expect(
      authenticateUser(validCredentials, dummyRequest),
    ).rejects.toBeInstanceOf(InvalidLoginError);
  });

  it("returns the mapped user on a fully valid login", async () => {
    findUnique.mockResolvedValue({
      ...baseUser,
      userRoles: [{ role: { name: "MEMBER" } }, { role: { name: "OWNER" } }],
    });

    const result = await authenticateUser(validCredentials, dummyRequest);

    expect(result).toEqual({
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      isEmailVerified: true,
      roles: ["MEMBER", "OWNER"],
      adminRole: null,
      isSuspended: false,
      isEnterpriseSuspended: false,
      sessionVersion: 1,
    });
    expect(compare).toHaveBeenCalledWith("CorrectPass123", "hashed");
  });
});
