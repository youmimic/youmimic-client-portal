import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDraftAndStripeCustomer } from "@/lib/checkout/delete-draft";

const deleteCheckoutDraft = vi.fn();
const customersDel = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    checkoutDraft: {
      delete: (...args: unknown[]) => deleteCheckoutDraft(...args),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  default: { customers: { del: (...args: unknown[]) => customersDel(...args) } },
}));

beforeEach(() => {
  deleteCheckoutDraft.mockReset();
  customersDel.mockReset();
});

describe("deleteDraftAndStripeCustomer", () => {
  it("deletes the Stripe customer before deleting the draft row", async () => {
    customersDel.mockResolvedValue(undefined);
    deleteCheckoutDraft.mockResolvedValue(undefined);

    await deleteDraftAndStripeCustomer({ id: "draft_1", stripeCustomerId: "cus_1" });

    expect(customersDel).toHaveBeenCalledWith("cus_1");
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_1" } });
    const delOrder = customersDel.mock.invocationCallOrder[0];
    const draftDeleteOrder = deleteCheckoutDraft.mock.invocationCallOrder[0];
    expect(delOrder).toBeLessThan(draftDeleteOrder);
  });

  it("skips Stripe deletion when there's no stripeCustomerId, but still deletes the row", async () => {
    deleteCheckoutDraft.mockResolvedValue(undefined);

    await deleteDraftAndStripeCustomer({ id: "draft_1", stripeCustomerId: null });

    expect(customersDel).not.toHaveBeenCalled();
    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_1" } });
  });

  it("still deletes the row when Stripe customer deletion fails", async () => {
    customersDel.mockRejectedValue(new Error("No such customer"));
    deleteCheckoutDraft.mockResolvedValue(undefined);

    await deleteDraftAndStripeCustomer({ id: "draft_1", stripeCustomerId: "cus_gone" });

    expect(deleteCheckoutDraft).toHaveBeenCalledWith({ where: { id: "draft_1" } });
  });
});
