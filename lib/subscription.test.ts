import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindMany = vi.fn();

// Same reasoning as lib/usage/ledger.test.ts: lib/prisma.ts throws at import
// time if DATABASE_URL is unset, so it must never actually be imported here.
vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: { findMany: (...args: unknown[]) => subscriptionFindMany(...args) },
  },
}));

import { getApplicableSubscription, userHasActiveSubscription } from "@/lib/subscription";

function fakeSub(overrides: Record<string, unknown>) {
  return {
    id: "sub",
    billingComponent: "STANDARD",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  subscriptionFindMany.mockReset();
});

describe("getApplicableSubscription", () => {
  it("resolves the PLATFORM_FEE row over AVATAR_STORAGE rows, regardless of array order", async () => {
    const platformFee = fakeSub({ id: "sub_fee", billingComponent: "PLATFORM_FEE", createdAt: new Date("2026-01-01") });
    const avatar1 = fakeSub({ id: "sub_avatar_1", billingComponent: "AVATAR_STORAGE", createdAt: new Date("2026-02-01") });
    const avatar2 = fakeSub({ id: "sub_avatar_2", billingComponent: "AVATAR_STORAGE", createdAt: new Date("2026-03-01") });

    // Order A: platform fee last in the array.
    subscriptionFindMany.mockResolvedValueOnce([]); // personal lookup: none
    subscriptionFindMany.mockResolvedValueOnce([avatar1, avatar2, platformFee]);
    const resultA = await getApplicableSubscription("user_1");
    expect(resultA?.id).toBe("sub_fee");

    // Order B: platform fee first — same result either way.
    subscriptionFindMany.mockResolvedValueOnce([]);
    subscriptionFindMany.mockResolvedValueOnce([platformFee, avatar1, avatar2]);
    const resultB = await getApplicableSubscription("user_1");
    expect(resultB?.id).toBe("sub_fee");
  });

  it("resolves a STANDARD row over AVATAR_STORAGE rows the same way", async () => {
    const standard = fakeSub({ id: "sub_standard", billingComponent: "STANDARD" });
    const avatar = fakeSub({ id: "sub_avatar", billingComponent: "AVATAR_STORAGE" });

    subscriptionFindMany.mockResolvedValueOnce([]); // personal: none
    subscriptionFindMany.mockResolvedValueOnce([avatar, standard]);

    const result = await getApplicableSubscription("user_1");
    expect(result?.id).toBe("sub_standard");
  });

  it("still falls back to whatever is active when only AVATAR_STORAGE rows exist (compatibility)", async () => {
    const avatar = fakeSub({ id: "sub_avatar_only", billingComponent: "AVATAR_STORAGE" });

    subscriptionFindMany.mockResolvedValueOnce([]); // personal: none
    subscriptionFindMany.mockResolvedValueOnce([avatar]);

    const result = await getApplicableSubscription("user_1");
    expect(result?.id).toBe("sub_avatar_only");
  });

  it("breaks a tie between two same-priority rows by newest createdAt first", async () => {
    const older = fakeSub({ id: "sub_older", billingComponent: "AVATAR_STORAGE", createdAt: new Date("2026-01-01") });
    const newer = fakeSub({ id: "sub_newer", billingComponent: "AVATAR_STORAGE", createdAt: new Date("2026-06-01") });

    subscriptionFindMany.mockResolvedValueOnce([]); // personal: none
    subscriptionFindMany.mockResolvedValueOnce([older, newer]);

    const result = await getApplicableSubscription("user_1");
    expect(result?.id).toBe("sub_newer");
  });

  it("breaks a tie between equal createdAt by id as a final, deterministic fallback", async () => {
    const sameTime = new Date("2026-01-01");
    const a = fakeSub({ id: "sub_a", billingComponent: "AVATAR_STORAGE", createdAt: sameTime });
    const b = fakeSub({ id: "sub_b", billingComponent: "AVATAR_STORAGE", createdAt: sameTime });

    subscriptionFindMany.mockResolvedValueOnce([]); // personal: none
    subscriptionFindMany.mockResolvedValueOnce([b, a]);

    const result = await getApplicableSubscription("user_1");
    expect(result?.id).toBe("sub_a");
  });

  it("still prefers a personal subscription over an owned enterprise's, even if the enterprise row would otherwise out-rank it", async () => {
    const personal = fakeSub({ id: "sub_personal", billingComponent: "AVATAR_STORAGE" });

    subscriptionFindMany.mockResolvedValueOnce([personal]); // personal lookup finds one — enterprise lookup must never run

    const result = await getApplicableSubscription("user_1");
    expect(result?.id).toBe("sub_personal");
    expect(subscriptionFindMany).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither lookup finds an active row", async () => {
    subscriptionFindMany.mockResolvedValueOnce([]);
    subscriptionFindMany.mockResolvedValueOnce([]);

    const result = await getApplicableSubscription("user_1");
    expect(result).toBeNull();
  });
});

describe("userHasActiveSubscription", () => {
  it("is true for a PLATFORM_FEE-only enterprise, not just STANDARD", async () => {
    subscriptionFindMany.mockResolvedValueOnce([]); // personal: none
    subscriptionFindMany.mockResolvedValueOnce([fakeSub({ billingComponent: "PLATFORM_FEE" })]);

    expect(await userHasActiveSubscription("user_1")).toBe(true);
  });

  it("is false when nothing is active", async () => {
    subscriptionFindMany.mockResolvedValueOnce([]);
    subscriptionFindMany.mockResolvedValueOnce([]);

    expect(await userHasActiveSubscription("user_1")).toBe(false);
  });
});
