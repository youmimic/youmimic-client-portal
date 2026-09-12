import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveGuestPriceId,
  createCheckoutDraft,
  updateCheckoutDraft,
} from "@/lib/checkout/create-draft";

const findUniqueUser = vi.fn();
const createCheckoutDraft_ = vi.fn();
const findUniqueCheckoutDraft = vi.fn();
const updateCheckoutDraft_ = vi.fn();
const findManyCheckoutDraft = vi.fn();
const deleteCheckoutDraft = vi.fn();
const customersDel = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
    },
    checkoutDraft: {
      create: (...args: unknown[]) => createCheckoutDraft_(...args),
      findUnique: (...args: unknown[]) => findUniqueCheckoutDraft(...args),
      update: (...args: unknown[]) => updateCheckoutDraft_(...args),
      findMany: (...args: unknown[]) => findManyCheckoutDraft(...args),
      delete: (...args: unknown[]) => deleteCheckoutDraft(...args),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  default: { customers: { del: (...args: unknown[]) => customersDel(...args) } },
}));

const VALID_INPUT = {
  planType: "MID_MARKET" as const,
  billingTerm: "MONTHLY_24" as const,
  email: "buyer@example.com",
  fullName: "Jane Buyer",
  companyName: "Acme Co",
};

beforeEach(() => {
  findUniqueUser.mockReset();
  createCheckoutDraft_.mockReset();
  findUniqueCheckoutDraft.mockReset();
  updateCheckoutDraft_.mockReset();
  findManyCheckoutDraft.mockReset().mockResolvedValue([]);
  deleteCheckoutDraft.mockReset();
  customersDel.mockReset();
  vi.stubEnv("STRIPE_MID_MARKET_24MO_PRICE_ID", "price_mid_market_24mo");
  vi.stubEnv("STRIPE_MID_MARKET_12MO_PRICE_ID", "price_mid_market_12mo");
  vi.stubEnv("STRIPE_SMALL_BUSINESS_24MO_PRICE_ID", "price_small_business_24mo");
  vi.stubEnv("STRIPE_SMALL_BUSINESS_12MO_PRICE_ID", "price_small_business_12mo");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveGuestPriceId", () => {
  it("maps MID_MARKET + MONTHLY_24 to the 24mo env var", () => {
    expect(resolveGuestPriceId("MID_MARKET", "MONTHLY_24")).toBe("price_mid_market_24mo");
  });

  it("maps MID_MARKET + MONTHLY_12 to the 12mo env var", () => {
    expect(resolveGuestPriceId("MID_MARKET", "MONTHLY_12")).toBe("price_mid_market_12mo");
  });

  it("maps SMALL_BUSINESS + MONTHLY_24 to the 24mo env var", () => {
    expect(resolveGuestPriceId("SMALL_BUSINESS", "MONTHLY_24")).toBe(
      "price_small_business_24mo",
    );
  });

  it("maps SMALL_BUSINESS + MONTHLY_12 to the 12mo env var", () => {
    expect(resolveGuestPriceId("SMALL_BUSINESS", "MONTHLY_12")).toBe(
      "price_small_business_12mo",
    );
  });
});

describe("createCheckoutDraft", () => {
  it("rejects invalid input before touching the database", async () => {
    const result = await createCheckoutDraft({
      planType: "MID_MARKET",
      billingTerm: "MONTHLY_24",
      email: "not-an-email",
      fullName: "J",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(findUniqueUser).not.toHaveBeenCalled();
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied planType/priceId outside the guest union and fails validation", async () => {
    const result = await createCheckoutDraft({
      ...VALID_INPUT,
      planType: "ENTERPRISE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("blocks the plan when its Stripe price id env var is unset", async () => {
    vi.stubEnv("STRIPE_MID_MARKET_24MO_PRICE_ID", "");

    const result = await createCheckoutDraft(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PLAN_NOT_CONFIGURED");
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("blocks the plan when its price id env var is still the placeholder value", async () => {
    vi.stubEnv("STRIPE_MID_MARKET_24MO_PRICE_ID", "price_...");

    const result = await createCheckoutDraft(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PLAN_NOT_CONFIGURED");
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("blocks guest checkout when the email already belongs to a User", async () => {
    findUniqueUser.mockResolvedValue({ id: "user_1" });

    const result = await createCheckoutDraft(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMAIL_IN_USE");
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("creates a draft with a resolved price id and normalized fields for a new email", async () => {
    findUniqueUser.mockResolvedValue(null);
    createCheckoutDraft_.mockResolvedValue({ id: "draft_1" });

    const result = await createCheckoutDraft({
      ...VALID_INPUT,
      email: "  Buyer@Example.com  ",
      fullName: "  Jane   Buyer  ",
    });

    expect(result).toEqual({ ok: true, draftId: "draft_1" });
    expect(createCheckoutDraft_).toHaveBeenCalledTimes(1);
    const callArgs = createCheckoutDraft_.mock.calls[0][0];
    expect(callArgs.data.email).toBe("buyer@example.com");
    expect(callArgs.data.fullName).toBe("Jane Buyer");
    expect(callArgs.data.status).toBe("CREATED");
    expect(callArgs.data.planType).toBe("MID_MARKET");
    expect(callArgs.data.billingTerm).toBe("MONTHLY_24");
  });

  it("stores a null companyName when omitted, never undefined", async () => {
    findUniqueUser.mockResolvedValue(null);
    createCheckoutDraft_.mockResolvedValue({ id: "draft_2" });

    const { companyName, ...withoutCompany } = VALID_INPUT;
    void companyName;
    await createCheckoutDraft(withoutCompany);

    const callArgs = createCheckoutDraft_.mock.calls[0][0];
    expect(callArgs.data.companyName).toBeNull();
  });

  it("overrides (deletes) an older abandoned draft for the same email, including its Stripe customer, before creating the new one", async () => {
    findUniqueUser.mockResolvedValue(null);
    findManyCheckoutDraft.mockResolvedValue([
      { id: "draft_old", stripeCustomerId: "cus_old" },
    ]);
    customersDel.mockResolvedValue(undefined);
    deleteCheckoutDraft.mockResolvedValue(undefined);
    createCheckoutDraft_.mockResolvedValue({ id: "draft_new" });

    const result = await createCheckoutDraft(VALID_INPUT);

    expect(result).toEqual({ ok: true, draftId: "draft_new" });
    const staleQuery = findManyCheckoutDraft.mock.calls[0][0];
    expect(staleQuery.where.email).toBe("buyer@example.com");
    expect(staleQuery.where.status).toEqual({ not: "COMPLETED" });
    expect(staleQuery.where.stripeSubscriptionId).toBeNull();

    expect(customersDel).toHaveBeenCalledWith("cus_old");
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_old" } });

    // Old draft deleted before the new one is created.
    const delOrder = deleteCheckoutDraft.mock.invocationCallOrder[0];
    const createOrder = createCheckoutDraft_.mock.invocationCallOrder[0];
    expect(delOrder).toBeLessThan(createOrder);
  });

  it("never overrides anything when no stale draft exists for the email", async () => {
    findUniqueUser.mockResolvedValue(null);
    findManyCheckoutDraft.mockResolvedValue([]);
    createCheckoutDraft_.mockResolvedValue({ id: "draft_new" });

    await createCheckoutDraft(VALID_INPUT);

    expect(customersDel).not.toHaveBeenCalled();
    expect(deleteCheckoutDraft).not.toHaveBeenCalled();
  });

  it("does not override anything when the new submission itself fails validation", async () => {
    await createCheckoutDraft({ ...VALID_INPUT, email: "not-an-email" });

    expect(findManyCheckoutDraft).not.toHaveBeenCalled();
  });

  it("does not override anything when the plan isn't configured", async () => {
    vi.stubEnv("STRIPE_MID_MARKET_24MO_PRICE_ID", "");

    await createCheckoutDraft(VALID_INPUT);

    expect(findManyCheckoutDraft).not.toHaveBeenCalled();
  });

  it("does not override anything when the email already belongs to a real User", async () => {
    findUniqueUser.mockResolvedValue({ id: "user_1" });

    await createCheckoutDraft(VALID_INPUT);

    expect(findManyCheckoutDraft).not.toHaveBeenCalled();
  });
});

describe("updateCheckoutDraft", () => {
  it("rejects invalid input before looking up the draft", async () => {
    const result = await updateCheckoutDraft("draft_1", {
      ...VALID_INPUT,
      email: "not-an-email",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(findUniqueCheckoutDraft).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the draft doesn't exist", async () => {
    findUniqueCheckoutDraft.mockResolvedValue(null);

    const result = await updateCheckoutDraft("missing_draft", VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
    expect(updateCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("refuses to edit an already-COMPLETED draft", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({
      status: "COMPLETED",
      stripeSubscriptionId: null,
    });

    const result = await updateCheckoutDraft("draft_1", VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_RESUMABLE");
    expect(updateCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("refuses to edit a draft that already has a real Stripe subscription attached", async () => {
    // Paid but not COMPLETED — the FAILED-needs-manual-review case from
    // lib/checkout/activate-guest-account.ts. Must never be silently reused
    // for a new attempt.
    findUniqueCheckoutDraft.mockResolvedValue({
      status: "FAILED",
      stripeSubscriptionId: "sub_already_paid",
    });

    const result = await updateCheckoutDraft("draft_1", VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_RESUMABLE");
    expect(updateCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("blocks the update when the (possibly changed) email now belongs to a User", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ status: "OPEN", stripeSubscriptionId: null });
    findUniqueUser.mockResolvedValue({ id: "user_1" });

    const result = await updateCheckoutDraft("draft_1", VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMAIL_IN_USE");
    expect(updateCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("updates the existing draft's fields in place, without touching expiresAt", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ status: "OPEN", stripeSubscriptionId: null });
    findUniqueUser.mockResolvedValue(null);
    updateCheckoutDraft_.mockResolvedValue({});

    const result = await updateCheckoutDraft("draft_1", {
      ...VALID_INPUT,
      planType: "SMALL_BUSINESS",
      billingTerm: "MONTHLY_12",
    });

    expect(result).toEqual({ ok: true, draftId: "draft_1" });
    expect(updateCheckoutDraft_).toHaveBeenCalledTimes(1);
    const [callArgs] = updateCheckoutDraft_.mock.calls[0];
    expect(callArgs.where).toEqual({ id: "draft_1" });
    expect(callArgs.data.planType).toBe("SMALL_BUSINESS");
    expect(callArgs.data.billingTerm).toBe("MONTHLY_12");
    expect(callArgs.data).not.toHaveProperty("expiresAt");
    expect(createCheckoutDraft_).not.toHaveBeenCalled();
  });

  it("excludes the draft being updated from the stale-draft override query", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ status: "OPEN", stripeSubscriptionId: null });
    findUniqueUser.mockResolvedValue(null);
    findManyCheckoutDraft.mockResolvedValue([]);
    updateCheckoutDraft_.mockResolvedValue({});

    await updateCheckoutDraft("draft_1", VALID_INPUT);

    const staleQuery = findManyCheckoutDraft.mock.calls[0][0];
    expect(staleQuery.where.id).toEqual({ not: "draft_1" });
  });

  it("overrides a different stale draft when resuming with a changed email that collides with it", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ status: "OPEN", stripeSubscriptionId: null });
    findUniqueUser.mockResolvedValue(null);
    findManyCheckoutDraft.mockResolvedValue([
      { id: "draft_other_stale", stripeCustomerId: null },
    ]);
    deleteCheckoutDraft.mockResolvedValue(undefined);
    updateCheckoutDraft_.mockResolvedValue({});

    await updateCheckoutDraft("draft_1", { ...VALID_INPUT, email: "different@example.com" });

    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_other_stale" } });
    expect(customersDel).not.toHaveBeenCalled();
  });
});
