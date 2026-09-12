import prisma from "@/lib/prisma";
import {
  createCheckoutDraftSchema,
  type GuestCheckoutPlanType,
  type GuestCheckoutBillingTerm,
} from "@/lib/validations/checkout-draft";
import { deleteDraftAndStripeCustomer } from "@/lib/checkout/delete-draft";

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

// The full data-retention window, not a Stripe session TTL (Stripe caps a
// Checkout Session's own lifetime at 24h regardless of this value — see
// app/api/stripe/guest-checkout-session/route.ts). An abandoned draft stays
// resumable — reminder emails at day 2 and day 7 link back to it — until
// lib/checkout/process-draft-lifecycle.ts permanently deletes it here.
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A fresh draft for this email supersedes any older one that's still
// abandoned (not converted, not paid) — rather than letting the old row
// (and its Stripe Customer) sit around indefinitely with a stale value
// alongside the new attempt. Never touches a COMPLETED draft or one with
// a real stripeSubscriptionId attached (paid, needs manual review — see
// activate-guest-account.ts's FAILED path); those aren't "abandoned" and
// must never be silently deleted. excludeDraftId is used by
// updateCheckoutDraft below so a resume-with-a-changed-email doesn't
// delete the very draft it's in the middle of updating.
async function overrideStaleDraftsForEmail(email: string, excludeDraftId?: string): Promise<void> {
  const stale = await prisma.checkoutDraft.findMany({
    where: {
      email,
      status: { not: "COMPLETED" },
      stripeSubscriptionId: null,
      ...(excludeDraftId ? { id: { not: excludeDraftId } } : {}),
    },
    select: { id: true, stripeCustomerId: true },
  });

  for (const draft of stale) {
    await deleteDraftAndStripeCustomer(draft);
  }
}

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

  await overrideStaleDraftsForEmail(email);

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

export type UpdateDraftResult =
  | { ok: true; draftId: string }
  | {
      ok: false;
      code: "VALIDATION" | "PLAN_NOT_CONFIGURED" | "EMAIL_IN_USE" | "NOT_FOUND" | "NOT_RESUMABLE";
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

// Used when a buyer resumes an existing draft from a reminder email (see
// app/checkout/page.tsx's draftId handling) and changes something on the
// prefilled review form — the plan/term picker, or one of the form fields —
// before proceeding to payment again. Updates the same row in place rather
// than creating a second one, so a person who comes back multiple times
// still has exactly one draft (and gets exactly two reminder emails, not
// two per attempt). Deliberately does NOT touch expiresAt: the 30-day
// deletion deadline is fixed from first abandonment, not extended just
// because they looked again without paying.
export async function updateCheckoutDraft(
  draftId: string,
  rawInput: unknown,
): Promise<UpdateDraftResult> {
  const parsed = createCheckoutDraftSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const existingDraft = await prisma.checkoutDraft.findUnique({
    where: { id: draftId },
    select: { status: true, stripeSubscriptionId: true },
  });
  if (!existingDraft) {
    return { ok: false, code: "NOT_FOUND", error: "This checkout session was not found." };
  }
  // A draft that already converted (COMPLETED) or that already has a real
  // Stripe subscription attached (paid, but account creation needs manual
  // review — see lib/checkout/activate-guest-account.ts's FAILED path) must
  // never be silently edited or reused for a new attempt.
  if (existingDraft.status === "COMPLETED" || existingDraft.stripeSubscriptionId) {
    return {
      ok: false,
      code: "NOT_RESUMABLE",
      error: "This checkout session can no longer be edited.",
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

  await overrideStaleDraftsForEmail(email, draftId);

  await prisma.checkoutDraft.update({
    where: { id: draftId },
    data: { planType, billingTerm, email, fullName, companyName: companyName || null },
  });

  return { ok: true, draftId };
}
