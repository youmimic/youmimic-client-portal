import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGuestPriceId, createCheckoutDraft } from "@/lib/checkout/create-draft";

const findUniqueUser = vi.fn();
const createCheckoutDraft_ = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUser(...args),
    },
    checkoutDraft: {
      create: (...args: unknown[]) => createCheckoutDraft_(...args),
    },
  },
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
});
