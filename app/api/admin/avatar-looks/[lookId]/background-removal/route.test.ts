import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ avatarLook: { findUnique: vi.fn(), update: vi.fn() } }));
const audit = vi.hoisted(() => ({ writeAuditLog: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/admin/audit", () => ({ writeAuditLog: audit.writeAuditLog, ENTITY_TYPES: { AVATAR: "avatar" } }));

import { PATCH } from "./route";

const call = (body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ lookId: "lk1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "admin1", adminRole: "ADMIN" } });
  db.avatarLook.findUnique.mockResolvedValue({ id: "lk1", name: "L03", heygenLookId: "hg", backgroundRemoval: "UNKNOWN", avatar: { id: "av1", userId: "u1" } });
  db.avatarLook.update.mockResolvedValue({});
});

describe("PATCH look background removal", () => {
  it("sets the value and writes an audit entry", async () => {
    const res = await call({ value: "SUPPORTED" });
    expect(res.status).toBe(200);
    expect(db.avatarLook.update).toHaveBeenCalledWith({ where: { id: "lk1" }, data: { backgroundRemoval: "SUPPORTED" } });
    expect(audit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "set_look_background_removal", entityId: "av1", targetUserId: "u1", metadata: expect.objectContaining({ from: "UNKNOWN", to: "SUPPORTED" }) }),
    );
  });

  it("refuses signed-out users, non-admins and billing-only admins", async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await call({ value: "SUPPORTED" })).status).toBe(401);
    authMock.mockResolvedValueOnce({ user: { id: "u1", adminRole: null } });
    expect((await call({ value: "SUPPORTED" })).status).toBe(403);
    authMock.mockResolvedValueOnce({ user: { id: "u2", adminRole: "BILLING_ADMIN" } });
    expect((await call({ value: "SUPPORTED" })).status).toBe(403);
    expect(db.avatarLook.update).not.toHaveBeenCalled();
  });

  it("rejects unknown values and unknown looks", async () => {
    expect((await call({ value: "YES" })).status).toBe(422);
    db.avatarLook.findUnique.mockResolvedValueOnce(null);
    expect((await call({ value: "SUPPORTED" })).status).toBe(404);
    expect(db.avatarLook.update).not.toHaveBeenCalled();
  });
});
