import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireDashboardSession } from "@/lib/auth/api-guards";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

function sessionWith(overrides: {
  hasAcceptedLegal: boolean;
  isEmailVerified: boolean;
  adminRole?: string | null;
}) {
  return { user: { id: "u1", adminRole: null, ...overrides } };
}

beforeEach(() => {
  authMock.mockReset();
});

describe("requireDashboardSession", () => {
  it("rejects when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const guard = await requireDashboardSession();

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("rejects a session missing legal acceptance, even for an admin", async () => {
    authMock.mockResolvedValue(
      sessionWith({ hasAcceptedLegal: false, isEmailVerified: true, adminRole: "SUPER_ADMIN" }),
    );

    const guard = await requireDashboardSession();

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(403);
      const body = await guard.response.json();
      expect(body.code).toBe("LEGAL_NOT_ACCEPTED");
    }
  });

  it("rejects an unverified non-admin when requireEmailVerified is set", async () => {
    authMock.mockResolvedValue(sessionWith({ hasAcceptedLegal: true, isEmailVerified: false }));

    const guard = await requireDashboardSession({ requireEmailVerified: true });

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      const body = await guard.response.json();
      expect(body.code).toBe("EMAIL_NOT_VERIFIED");
    }
  });

  it("does not check email verification unless requireEmailVerified is passed", async () => {
    authMock.mockResolvedValue(sessionWith({ hasAcceptedLegal: true, isEmailVerified: false }));

    const guard = await requireDashboardSession();

    expect(guard.ok).toBe(true);
  });

  it("exempts an admin from the email-verified check", async () => {
    authMock.mockResolvedValue(
      sessionWith({ hasAcceptedLegal: true, isEmailVerified: false, adminRole: "ADMIN" }),
    );

    const guard = await requireDashboardSession({ requireEmailVerified: true });

    expect(guard.ok).toBe(true);
  });

  it("passes a fully-compliant session through", async () => {
    authMock.mockResolvedValue(sessionWith({ hasAcceptedLegal: true, isEmailVerified: true }));

    const guard = await requireDashboardSession({ requireEmailVerified: true });

    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.session.user.id).toBe("u1");
  });
});
