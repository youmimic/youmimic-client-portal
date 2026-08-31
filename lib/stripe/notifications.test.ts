import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSubscriptionOwner, notifyBillingAdmins } from "@/lib/stripe/notifications";

// "server-only" is a Next.js-specific magic import that Next's own bundler
// special-cases — it isn't a real resolvable npm package outside that
// bundler, so Vitest can't load it without this stub.
vi.mock("server-only", () => ({}));

const findUniqueSubscription = vi.fn();
const findManyUser = vi.fn();
const sendAdminBillingEventEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      findUnique: (...args: unknown[]) => findUniqueSubscription(...args),
    },
    user: {
      findMany: (...args: unknown[]) => findManyUser(...args),
    },
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendAdminBillingEventEmail: (...args: unknown[]) =>
    sendAdminBillingEventEmail(...args),
}));

beforeEach(() => {
  findUniqueSubscription.mockReset();
  findManyUser.mockReset();
  sendAdminBillingEventEmail.mockReset();
});

describe("resolveSubscriptionOwner", () => {
  it("returns null when the subscription doesn't exist", async () => {
    findUniqueSubscription.mockResolvedValue(null);

    const result = await resolveSubscriptionOwner("sub_missing");

    expect(result).toBeNull();
  });

  it("resolves the user directly for a personal subscription", async () => {
    findUniqueSubscription.mockResolvedValue({
      user: { id: "user_1", email: "user@example.com", name: "Jane" },
      enterprise: null,
    });

    const result = await resolveSubscriptionOwner("sub_personal");

    expect(result).toEqual({
      userId: "user_1",
      email: "user@example.com",
      name: "Jane",
      enterpriseId: null,
    });
  });

  it("resolves the enterprise owner for an enterprise-owned subscription", async () => {
    findUniqueSubscription.mockResolvedValue({
      user: null,
      enterprise: {
        id: "ent_1",
        owner: { id: "owner_1", email: "owner@example.com", name: "Acme Owner" },
      },
    });

    const result = await resolveSubscriptionOwner("sub_enterprise");

    expect(result).toEqual({
      userId: "owner_1",
      email: "owner@example.com",
      name: "Acme Owner",
      enterpriseId: "ent_1",
    });
  });

  it("returns null when neither a user nor an enterprise owner can be resolved", async () => {
    findUniqueSubscription.mockResolvedValue({ user: null, enterprise: null });

    const result = await resolveSubscriptionOwner("sub_orphan");

    expect(result).toBeNull();
  });
});

describe("notifyBillingAdmins", () => {
  it("skips sending when there are no billing admins", async () => {
    findManyUser.mockResolvedValue([]);

    await notifyBillingAdmins({
      eventLabel: "Payment failed",
      summary: "Something happened",
      detailsUrl: "https://example.com/admin/activity",
      idempotencyKey: "test-key",
    });

    expect(sendAdminBillingEventEmail).not.toHaveBeenCalled();
  });

  it("sends one email to every billing admin's address", async () => {
    findManyUser.mockResolvedValue([
      { email: "admin1@example.com" },
      { email: "admin2@example.com" },
    ]);

    await notifyBillingAdmins({
      eventLabel: "Payment failed",
      summary: "Something happened",
      detailsUrl: "https://example.com/admin/activity",
      idempotencyKey: "test-key",
    });

    expect(sendAdminBillingEventEmail).toHaveBeenCalledTimes(1);
    expect(sendAdminBillingEventEmail).toHaveBeenCalledWith({
      to: ["admin1@example.com", "admin2@example.com"],
      eventLabel: "Payment failed",
      summary: "Something happened",
      detailsUrl: "https://example.com/admin/activity",
      idempotencyKey: "test-key",
    });
  });

  it("queries only BILLING_ADMIN-tier-and-above roles", async () => {
    findManyUser.mockResolvedValue([]);

    await notifyBillingAdmins({
      eventLabel: "x",
      summary: "x",
      detailsUrl: "x",
      idempotencyKey: "x",
    });

    expect(findManyUser).toHaveBeenCalledWith({
      where: { adminRole: { in: ["BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"] } },
      select: { email: true },
    });
  });
});
