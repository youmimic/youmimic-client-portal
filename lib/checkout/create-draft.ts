import prisma from "@/lib/prisma";
import {
  createCheckoutDraftSchema,
  type GuestCheckoutPlanType,
  type GuestCheckoutBillingTerm,
} from "@/lib/validations/checkout-draft";

// Same env-var mapping as app/api/stripe/checkout-session/route.ts's
// resolvePriceId — duplicated rather than imported since that function is
// scoped to the authenticated route's own plan union (CREATOR/ENTERPRISE
// included). Kept here as the guest path's own source of truth so a change
// to one never silently changes the other's plan eligibility.
export function resolveGuestPriceId(
  planType: GuestCheckoutPlanType,
  billingTerm: GuestCheckoutBillingTerm,
): string | undefined {
  switch (planType) {
    case "MID_MARKET":
      return billingTerm === "MONTHLY_24"
        ? process.env.STRIPE_MID_MARKET_24MO_PRICE_ID
        : process.env.STRIPE_MID_MARKET_12MO_PRICE_ID;
    case "SMALL_BUSINESS":
      return billingTerm === "MONTHLY_24"
        ? process.env.STRIPE_SMALL_BUSINESS_24MO_PRICE_ID
        : process.env.STRIPE_SMALL_BUSINESS_12MO_PRICE_ID;
  }
}

// Drafts are short-lived — long enough for someone to fill in the review
// page and get redirected to Stripe, not a saved cart. 24h comfortably
// covers "filled the form, got distracted, came back later today" without
// leaving a stale draft usable for very long if abandoned.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type CreateDraftResult =
  | { ok: true; draftId: string }
  | {
      ok: false;
      code: "VALIDATION" | "PLAN_NOT_CONFIGURED" | "EMAIL_IN_USE";
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

// Server-side-only entry point for the guest Mid Market / Small Business
// checkout review page (app/checkout) — never trusts a plan name, price, or
// eligibility value from the browser beyond the plan key + billing term,
// both of which are re-validated against real env-configured Stripe price
// ids before a draft is even created.
export async function createCheckoutDraft(rawInput: unknown): Promise<CreateDraftResult> {
  const parsed = createCheckoutDraftSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { planType, billingTerm, email, fullName, companyName } = parsed.data;

  const priceId = resolveGuestPriceId(planType, billingTerm);
  if (!priceId || priceId === "price_...") {
    return {
      ok: false,
      code: "PLAN_NOT_CONFIGURED",
      error: "This plan is not currently available for purchase.",
    };
  }

  // Guest checkout is intentionally blocked for an email that already has
  // an account — attaching a paid subscription to an account the buyer
  // hasn't proven they control is exactly the kind of ambiguity the spec
  // asked to avoid. They're sent to sign in instead, where the existing
  // authenticated checkout path already handles reusing their account.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return {
      ok: false,
      code: "EMAIL_IN_USE",
      error: "An account already exists for this email. Sign in to continue.",
      fieldErrors: { email: ["An account already exists for this email"] },
    };
  }

  const draft = await prisma.checkoutDraft.create({
    data: {
      status: "CREATED",
      planType,
      billingTerm,
      email,
      fullName,
      companyName: companyName || null,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
    select: { id: true },
  });

  return { ok: true, draftId: draft.id };
}
