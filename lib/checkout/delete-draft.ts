import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";

// Deletes a CheckoutDraft row and, if present, its associated Stripe
// Customer. Shared by two callers: the 30-day retention purge
// (lib/checkout/process-draft-lifecycle.ts) and lib/checkout/create-draft.ts,
// which calls this to clear out an older, still-abandoned draft for the
// same email before a fresh one supersedes it — rather than leaving the
// old row (and its Stripe Customer) sitting there indefinitely with a
// stale value, live in Stripe long after the buyer moved on.
//
// A Stripe-side failure (already deleted, transient API issue) is logged
// but never blocks deleting our own row — the point is not leaving stale
// PII in OUR database regardless of whether Stripe cooperates.
export async function deleteDraftAndStripeCustomer(draft: {
  id: string;
  stripeCustomerId: string | null;
}): Promise<void> {
  if (draft.stripeCustomerId) {
    try {
      await stripe.customers.del(draft.stripeCustomerId);
    } catch (err) {
      console.error(
        `Failed to delete Stripe customer ${draft.stripeCustomerId} for checkout draft ${draft.id}:`,
        err,
      );
    }
  }
  await prisma.checkoutDraft.delete({ where: { id: draft.id } });
}
