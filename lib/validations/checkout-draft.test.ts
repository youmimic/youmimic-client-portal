import { describe, expect, it } from "vitest";
import { createCheckoutDraftSchema } from "@/lib/validations/checkout-draft";

const BASE = {
  planType: "MID_MARKET" as const,
  billingTerm: "MONTHLY_24" as const, // Mid Market 24mo allows up to 5
  email: "buyer@example.com",
  fullName: "Jane Buyer",
  acceptTerms: true,
  termsLinkClicked: true,
  acceptPrivacyPolicy: true,
  privacyPolicyLinkClicked: true,
};

describe("createCheckoutDraftSchema — avatarCount", () => {
  it("accepts a count within the plan/term's allowance", () => {
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, avatarCount: 5 }).success).toBe(true);
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, avatarCount: 1 }).success).toBe(true);
  });

  it("rejects a count above the plan/term's allowance", () => {
    const result = createCheckoutDraftSchema.safeParse({ ...BASE, avatarCount: 6 });
    expect(result.success).toBe(false);
  });

  it("re-checks against the chosen term specifically, not just the plan", () => {
    // Mid Market 12mo allows 10 — the same count of 8 is valid there but
    // invalid on 24mo (max 5), so this must fail for the 24mo term in BASE.
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, billingTerm: "MONTHLY_12", avatarCount: 8 }).success).toBe(
      true,
    );
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, billingTerm: "MONTHLY_24", avatarCount: 8 }).success).toBe(
      false,
    );
  });

  it("rejects a non-positive or non-integer count before the allowance check even runs", () => {
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, avatarCount: 0 }).success).toBe(false);
    expect(createCheckoutDraftSchema.safeParse({ ...BASE, avatarCount: 2.5 }).success).toBe(false);
  });
});
