import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isCheckoutPlanKey, isBillingTermKey } from "@/lib/checkout/plan-keys";
import { CheckoutCard } from "./checkout-card";

export const metadata = {
  title: "Checkout — YouMimic",
};

// Looks up a draftId from a reminder email's resume link
// (lib/checkout/process-draft-lifecycle.ts builds these) so the review page
// can prefill the buyer's already-given details instead of making them
// retype everything. Deliberately permissive on failure: an unknown,
// already-completed, already-paid, or past-retention-deadline draftId just
// falls back to a normal blank entry rather than erroring — resuming is a
// nicety, not something the page depends on.
async function findResumableDraft(draftId: string | undefined) {
  if (!draftId) return null;

  const draft = await prisma.checkoutDraft.findUnique({
    where: { id: draftId },
    select: {
      planType: true,
      billingTerm: true,
      email: true,
      fullName: true,
      companyName: true,
      status: true,
      stripeSubscriptionId: true,
      expiresAt: true,
    },
  });

  if (!draft) return null;
  // COMPLETED = already converted; a set stripeSubscriptionId with any other
  // status means it was actually paid but needs manual review (see
  // lib/checkout/activate-guest-account.ts's FAILED path) — never offer
  // either of those up for a fresh payment attempt.
  if (draft.status === "COMPLETED" || draft.stripeSubscriptionId) return null;
  if (draft.expiresAt < new Date()) return null;

  return draft;
}

// Public entry point from the pricing page's Mid Market / Small Business
// "Get Started" buttons — reachable without being logged in. An already
// authenticated visitor is sent straight to the existing (unchanged)
// authenticated confirm-and-pay page, so this file never duplicates that
// page's checkout logic. Corporate never links here (stays "Contact Sales"
// only, no self-serve checkout of any kind).
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; term?: string; draftId?: string }>;
}) {
  const { plan, term, draftId } = await searchParams;

  if (!isCheckoutPlanKey(plan) || !isBillingTermKey(term)) {
    redirect("/pricing");
  }

  const session = await auth();
  if (session?.user) {
    redirect(`/dashboard/checkout?plan=${plan}&term=${term}`);
  }

  const resumableDraft = await findResumableDraft(draftId);
  // The draft's own stored plan/term is authoritative over the URL's when
  // resuming — it's what the buyer actually chose and what the reminder
  // email described, whereas the query string could in principle be stale
  // or hand-edited.
  const resolvedPlan = resumableDraft ? (resumableDraft.planType as typeof plan) : plan;
  const resolvedTerm = resumableDraft ? (resumableDraft.billingTerm as typeof term) : term;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirm your plan</h1>
        <p className="text-muted-foreground">
          Review your selection, then continue to secure payment. Changed your mind? Pick a
          different plan or billing term right here.
        </p>
      </div>

      <CheckoutCard
        initialPlan={resolvedPlan}
        initialTerm={resolvedTerm}
        resumeDraftId={resumableDraft ? draftId : undefined}
        initialEmail={resumableDraft?.email}
        initialFullName={resumableDraft?.fullName}
        initialCompanyName={resumableDraft?.companyName ?? undefined}
      />
    </div>
  );
}
