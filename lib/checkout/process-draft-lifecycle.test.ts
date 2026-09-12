import { beforeEach, describe, expect, it, vi } from "vitest";
import { processCheckoutDraftLifecycle } from "@/lib/checkout/process-draft-lifecycle";

const findManyCheckoutDraft = vi.fn();
const updateCheckoutDraft = vi.fn();
const deleteCheckoutDraft = vi.fn();
const sendCheckoutReminder2dEmail = vi.fn();
const sendCheckoutReminder7dEmail = vi.fn();
const customersDel = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    checkoutDraft: {
      findMany: (...args: unknown[]) => findManyCheckoutDraft(...args),
      update: (...args: unknown[]) => updateCheckoutDraft(...args),
      delete: (...args: unknown[]) => deleteCheckoutDraft(...args),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  default: { customers: { del: (...args: unknown[]) => customersDel(...args) } },
}));

vi.mock("@/lib/mailer", () => ({
  sendCheckoutReminder2dEmail: (...args: unknown[]) => sendCheckoutReminder2dEmail(...args),
  sendCheckoutReminder7dEmail: (...args: unknown[]) => sendCheckoutReminder7dEmail(...args),
}));

const DRAFT = {
  id: "draft_1",
  email: "buyer@example.com",
  fullName: "Jane Buyer",
  planType: "MID_MARKET",
  billingTerm: "MONTHLY_24",
};

function mockQueries({
  due2d = [],
  due7d = [],
  expired = [],
}: {
  due2d?: unknown[];
  due7d?: unknown[];
  expired?: unknown[];
}) {
  findManyCheckoutDraft
    .mockResolvedValueOnce(due2d)
    .mockResolvedValueOnce(due7d)
    .mockResolvedValueOnce(expired);
}

beforeEach(() => {
  findManyCheckoutDraft.mockReset();
  updateCheckoutDraft.mockReset();
  deleteCheckoutDraft.mockReset();
  sendCheckoutReminder2dEmail.mockReset();
  sendCheckoutReminder7dEmail.mockReset();
  customersDel.mockReset();
});

describe("processCheckoutDraftLifecycle — reminder queries", () => {
  it("excludes COMPLETED drafts and drafts with a real Stripe subscription from every query", async () => {
    mockQueries({});

    await processCheckoutDraftLifecycle();

    for (const call of findManyCheckoutDraft.mock.calls) {
      const where = call[0].where;
      expect(where.status).toEqual({ not: "COMPLETED" });
      expect(where.stripeSubscriptionId).toBeNull();
    }
  });

  it("sends the 2-day reminder and marks reminder2dSentAt", async () => {
    mockQueries({ due2d: [DRAFT] });
    sendCheckoutReminder2dEmail.mockResolvedValue(undefined);

    const result = await processCheckoutDraftLifecycle();

    expect(result.sent2d).toBe(1);
    expect(sendCheckoutReminder2dEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendCheckoutReminder2dEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("buyer@example.com");
    expect(emailArgs.name).toBe("Jane Buyer");
    expect(emailArgs.planLabel).toBe("Mid Market");
    expect(emailArgs.priceDisplay).toBe("$1,499 p/m");
    expect(emailArgs.resumeUrl).toContain("draftId=draft_1");
    expect(emailArgs.idempotencyKey).toBe("checkout-reminder-2d/draft_1");

    expect(updateCheckoutDraft).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { reminder2dSentAt: expect.any(Date) },
    });
  });

  it("sends the 7-day reminder and marks reminder7dSentAt", async () => {
    mockQueries({ due7d: [DRAFT] });
    sendCheckoutReminder7dEmail.mockResolvedValue(undefined);

    const result = await processCheckoutDraftLifecycle();

    expect(result.sent7d).toBe(1);
    expect(sendCheckoutReminder7dEmail).toHaveBeenCalledTimes(1);
    expect(updateCheckoutDraft).toHaveBeenCalledWith({
      where: { id: "draft_1" },
      data: { reminder7dSentAt: expect.any(Date) },
    });
  });

  it("does not mark a reminder sent when the email send throws, and keeps processing", async () => {
    mockQueries({ due2d: [DRAFT] });
    sendCheckoutReminder2dEmail.mockRejectedValue(new Error("resend down"));

    const result = await processCheckoutDraftLifecycle();

    expect(result.sent2d).toBe(0);
    expect(updateCheckoutDraft).not.toHaveBeenCalled();
  });
});

describe("processCheckoutDraftLifecycle — 30-day purge", () => {
  it("deletes the Stripe customer before deleting the draft row", async () => {
    mockQueries({ expired: [{ id: "draft_old", stripeCustomerId: "cus_123" }] });
    customersDel.mockResolvedValue(undefined);
    deleteCheckoutDraft.mockResolvedValue(undefined);

    const result = await processCheckoutDraftLifecycle();

    expect(result.deleted).toBe(1);
    expect(customersDel).toHaveBeenCalledWith("cus_123");
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_old" } });

    const delOrder = customersDel.mock.invocationCallOrder[0];
    const draftDeleteOrder = deleteCheckoutDraft.mock.invocationCallOrder[0];
    expect(delOrder).toBeLessThan(draftDeleteOrder);
  });

  it("skips Stripe customer deletion when the draft has none, but still deletes the row", async () => {
    mockQueries({ expired: [{ id: "draft_old", stripeCustomerId: null }] });
    deleteCheckoutDraft.mockResolvedValue(undefined);

    const result = await processCheckoutDraftLifecycle();

    expect(result.deleted).toBe(1);
    expect(customersDel).not.toHaveBeenCalled();
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_old" } });
  });

  it("still deletes the draft row even when Stripe customer deletion fails", async () => {
    mockQueries({ expired: [{ id: "draft_old", stripeCustomerId: "cus_already_gone" }] });
    customersDel.mockRejectedValue(new Error("No such customer"));
    deleteCheckoutDraft.mockResolvedValue(undefined);

    const result = await processCheckoutDraftLifecycle();

    expect(result.deleted).toBe(1);
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_old" } });
  });
});
