import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateGuestAccountForDraft } from "@/lib/checkout/activate-guest-account";

const findUniqueCheckoutDraft = vi.fn();
const updateCheckoutDraft = vi.fn();
const findUniqueUser = vi.fn();
const createUser = vi.fn();
const createPasswordResetToken = vi.fn();
const createSubscription = vi.fn();
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

  it("creates a user, a password reset token, and a Subscription row owned by the new user in one transaction", async () => {
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

    // The Subscription row must always carry a non-null userId — the DB's
    // subscriptions_exactly_one_owner_check constraint forbids a row with
    // neither userId nor enterpriseId set, so it can only be created once
    // the User exists, never as an earlier "userId: null" placeholder.
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

    expect(updateCheckoutDraft).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { status: "COMPLETED", userId: "user_new", subscriptionId: "sub_row_new" },
    });

    expect(sendAdminWelcomeEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendAdminWelcomeEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("buyer@example.com");
    expect(emailArgs.setPasswordUrl).toContain("/reset-password?token=");
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
