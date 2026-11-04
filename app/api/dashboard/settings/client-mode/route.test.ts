import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const authMock = vi.fn();
const updateUser = vi.fn();

vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { update: (...args: unknown[]) => updateUser(...args) } },
}));

function sessionWith(overrides: { adminRole?: string | null }) {
  return {
    user: {
      id: "u1",
      hasAcceptedLegal: true,
      isEmailVerified: true,
      adminRole: null,
      ...overrides,
    },
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/dashboard/settings/client-mode", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  updateUser.mockReset();
});

describe("PATCH /api/dashboard/settings/client-mode", () => {
  it("rejects when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await PATCH(req({ enabled: false }));

    expect(res.status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects a non-admin session", async () => {
    authMock.mockResolvedValue(sessionWith({ adminRole: null }));

    const res = await PATCH(req({ enabled: false }));

    expect(res.status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid body for an admin session", async () => {
    authMock.mockResolvedValue(sessionWith({ adminRole: "SUPER_ADMIN" }));

    const res = await PATCH(req({ enabled: "yes" }));

    expect(res.status).toBe(422);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates clientModeEnabled for an admin session", async () => {
    authMock.mockResolvedValue(sessionWith({ adminRole: "SUPER_ADMIN" }));
    updateUser.mockResolvedValue(undefined);

    const res = await PATCH(req({ enabled: false }));

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { clientModeEnabled: false },
    });
  });
});
