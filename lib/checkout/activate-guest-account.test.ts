import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateGuestAccountForDraft } from "@/lib/checkout/activate-guest-account";

const findUniqueCheckoutDraft = vi.fn();
const updateCheckoutDraft = vi.fn();
const findUniqueUser = vi.fn();
const createUser = vi.fn();
const createPasswordResetToken = vi.fn();
const createSubscription = vi.fn();
const upsertRole = vi.fn();
const createEnterprise = vi.fn();
const createEnterpriseMember = vi.fn();
const sendAdminWelcomeEmail = vi.fn();

const tx = {
  checkoutDraft: {
    findUnique: (...args: unknown[]) => findUniqueCheckoutDraft(...args),
    update: (...args: unknown[]) => updateCheckoutDraft(...args),
  },
  user: {
    findUnique: (...args: unknown[]) => findUniqueUser(...args),
    create: (...args: unknown[]) => createUser(...args),
  },
  passwordResetToken: {
    create: (...args: unknown[]) => createPasswordResetToken(...args),
  },
  subscription: {
    create: (...args: unknown[]) => createSubscription(...args),
  },
  role: {
    upsert: (...args: unknown[]) => upsertRole(...args),
  },
  enterprise: {
    create: (...args: unknown[]) => createEnterprise(...args),
  },
  enterpriseMember: {
    create: (...args: unknown[]) => createEnterpriseMember(...args),
  },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    checkoutDraft: {
      findUnique: (...args: unknown[]) => findUniqueCheckoutDraft(...args),
      update: (...args: unknown[]) => updateCheckoutDraft(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendAdminWelcomeEmail: (...args: unknown[]) => sendAdminWelcomeEmail(...args),
}));

const DRAFT = {
  id: "draft_1",
  email: "buyer@example.com",
  fullName: "Jane Buyer",
  companyName: "Acme Co",
  planType: "MID_MARKET",
  billingTerm: "MONTHLY_24",
  userId: null,
  subscriptionId: null,
  stripeCustomerId: "cus_123",
};

beforeEach(() => {
  findUniqueCheckoutDraft.mockReset();
  updateCheckoutDraft.mockReset();
  findUniqueUser.mockReset();
  createUser.mockReset();
  createPasswordResetToken.mockReset();
  createSubscription.mockReset();
  upsertRole.mockReset().mockResolvedValue({ id: "role_owner" });
  createEnterprise.mockReset().mockResolvedValue({ id: "enterprise_new" });
  createEnterpriseMember.mockReset();
  sendAdminWelcomeEmail.mockReset();
  vi.stubEnv("NEXTAUTH_URL", "https://app.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("activateGuestAccountForDraft", () => {
  it("no-ops when the draft doesn't exist", async () => {
    findUniqueCheckoutDraft.mockResolvedValue(null);

    const result = await activateGuestAccountForDraft("missing_draft", "sub_stripe_1");

    expect(result).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(sendAdminWelcomeEmail).not.toHaveBeenCalled();
  });

  it("is idempotent: no-ops when the draft already has a userId (retry/redelivery)", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT, userId: "user_already_created" });

    const result = await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(result).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(sendAdminWelcomeEmail).not.toHaveBeenCalled();
  });

  it("is idempotent against a race: re-checks userId inside the transaction", async () => {
    // Outer check (before the transaction starts) sees no userId yet...
    findUniqueCheckoutDraft.mockResolvedValueOnce({ ...DRAFT, userId: null });
    // ...but a concurrent webhook delivery attaches one before this
    // transaction's own re-check runs.
    findUniqueCheckoutDraft.mockResolvedValueOnce({ userId: "user_from_other_delivery" });

    const result = await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(result).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(sendAdminWelcomeEmail).not.toHaveBeenCalled();
  });

  it("creates a user, a password reset token, a Subscription row, and an owned Enterprise in one transaction", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT });
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: "user_new", name: "Jane Buyer", email: "buyer@example.com" });
    createSubscription.mockResolvedValue({ id: "sub_row_new" });
    sendAdminWelcomeEmail.mockResolvedValue(undefined);

    const result = await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(result).toEqual({ subscriptionId: "sub_row_new" });

    expect(createUser).toHaveBeenCalledTimes(1);
    const createUserArgs = createUser.mock.calls[0][0];
    expect(createUserArgs.data.email).toBe("buyer@example.com");
    expect(createUserArgs.data.companyName).toBe("Acme Co");
    expect(createUserArgs.data.passwordHash).not.toBe("buyer@example.com");

    expect(createPasswordResetToken).toHaveBeenCalledTimes(1);
    expect(createPasswordResetToken.mock.calls[0][0].data.userId).toBe("user_new");

    // The Subscription belongs to the new Enterprise, not the user
    // personally — so the admin Enterprises list (which reads plan/status
    // via enterprise.subscriptions) shows it correctly. The DB's
    // subscriptions_exactly_one_owner_check constraint still holds: exactly
    // enterpriseId is set here, no userId.
    expect(createSubscription).toHaveBeenCalledWith({
      data: {
        ownerType: "ENTERPRISE",
        enterpriseId: "enterprise_new",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_stripe_1",
        planType: "MID_MARKET",
        billingTerm: "MONTHLY_24",
        status: "ACTIVE",
      },
      select: { id: true },
    });

    expect(updateCheckoutDraft).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { status: "COMPLETED", userId: "user_new", subscriptionId: "sub_row_new" },
    });

    // Same pattern as the admin "create enterprise" action
    // (app/api/admin/enterprises/route.ts) — an owner Role, an Enterprise
    // named after the company, and an owner EnterpriseMember row.
    expect(createEnterprise).toHaveBeenCalledWith({
      data: { name: "Acme Co", ownerUserId: "user_new" },
      select: { id: true },
    });
    expect(createEnterpriseMember).toHaveBeenCalledWith({
      data: { enterpriseId: "enterprise_new", userId: "user_new", roleId: "role_owner" },
    });

    expect(sendAdminWelcomeEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendAdminWelcomeEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("buyer@example.com");
    expect(emailArgs.setPasswordUrl).toContain("/reset-password?token=");
  });

  it("skips Enterprise creation when the draft somehow has no companyName, and falls back to a USER-owned Subscription (defensive — the schema requires companyName for new drafts)", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT, companyName: null });
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: "user_new", name: "Jane Buyer", email: "buyer@example.com" });
    createSubscription.mockResolvedValue({ id: "sub_row_new" });

    await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(createEnterprise).not.toHaveBeenCalled();
    expect(createEnterpriseMember).not.toHaveBeenCalled();
    expect(createSubscription).toHaveBeenCalledWith({
      data: {
        ownerType: "USER",
        userId: "user_new",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_stripe_1",
        planType: "MID_MARKET",
        billingTerm: "MONTHLY_24",
        status: "ACTIVE",
      },
      select: { id: true },
    });
  });

  it("creates the Subscription with a null stripeSubscriptionId when the checkout session had none yet", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT });
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: "user_new", name: "Jane Buyer", email: "buyer@example.com" });
    createSubscription.mockResolvedValue({ id: "sub_row_new" });

    await activateGuestAccountForDraft("draft_1", null);

    expect(createSubscription.mock.calls[0][0].data.stripeSubscriptionId).toBeNull();
  });

  it("refuses to auto-attach and marks the draft FAILED, persisting stripeSubscriptionId as proof payment succeeded", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT });
    findUniqueUser.mockResolvedValue({ id: "user_registered_later" });

    const result = await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(result).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    // stripeSubscriptionId must be persisted here — it's the only signal
    // that lets lib/checkout/create-draft.ts's overrideStaleDraftsForEmail,
    // process-draft-lifecycle.ts's reminder/purge job, and
    // app/checkout/page.tsx's findResumableDraft tell "already paid, needs
    // manual review" apart from a plain abandoned draft. Without it, a row
    // representing real money already taken could get emailed "complete
    // your purchase" or silently deleted after 30 days.
    expect(updateCheckoutDraft).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { status: "FAILED", stripeSubscriptionId: "sub_stripe_1" },
    });
    expect(sendAdminWelcomeEmail).not.toHaveBeenCalled();
  });

  it("still returns the subscriptionId when NEXTAUTH_URL is unset, but does not send the activation email", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT });
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: "user_new", name: "Jane Buyer", email: "buyer@example.com" });
    createSubscription.mockResolvedValue({ id: "sub_row_new" });

    const result = await activateGuestAccountForDraft("draft_1", "sub_stripe_1");

    expect(result).toEqual({ subscriptionId: "sub_row_new" });
    expect(sendAdminWelcomeEmail).not.toHaveBeenCalled();
  });

  it("swallows an email-send failure without throwing (webhook must still 200)", async () => {
    findUniqueCheckoutDraft.mockResolvedValue({ ...DRAFT });
    findUniqueUser.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: "user_new", name: "Jane Buyer", email: "buyer@example.com" });
    createSubscription.mockResolvedValue({ id: "sub_row_new" });
    sendAdminWelcomeEmail.mockRejectedValue(new Error("send failed"));

    await expect(activateGuestAccountForDraft("draft_1", "sub_stripe_1")).resolves.toEqual({
      subscriptionId: "sub_row_new",
    });
  });
});
