import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ appSetting: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ default: db }));

import { backgroundsEnabledFor, withBackgroundAccess } from "@/lib/backgrounds/access";
import type { AvatarOption } from "@/lib/projects/rules";

beforeEach(() => vi.clearAllMocks());

describe("backgrounds launch switch", () => {
  it("off (or never set): admins only", async () => {
    db.appSetting.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValueOnce({ adminRole: "ADMIN" });
    expect(await backgroundsEnabledFor("admin")).toBe(true);
    db.user.findUnique.mockResolvedValueOnce({ adminRole: null });
    expect(await backgroundsEnabledFor("client")).toBe(false);
  });

  it("on: everyone", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: true });
    expect(await backgroundsEnabledFor("client")).toBe(true);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("a stored value of the wrong type counts as off", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: "yes" });
    db.user.findUnique.mockResolvedValueOnce({ adminRole: null });
    expect(await backgroundsEnabledFor("client")).toBe(false);
  });

  it("hides background support from users without access", () => {
    const avatars = [
      { id: "a", looks: [{ id: "l", backgroundRemoval: "SUPPORTED", cutoutUrl: "https://x/c.png" }] },
    ] as unknown as AvatarOption[];
    expect(withBackgroundAccess(avatars, true)).toBe(avatars);
    expect(withBackgroundAccess(avatars, false)[0].looks[0]).toMatchObject({ backgroundRemoval: "UNKNOWN", cutoutUrl: "https://x/c.png" });
  });
});
