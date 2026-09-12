import { z } from "zod";

// Same rules as lib/validations/auth.ts's private normalizeEmail/emailRegex.
const emailRegex =
  /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_'+\-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeEmail = (value: string) => value.trim().toLowerCase();

// Only the two self-serve marketing tiers ever go through the guest
// checkout draft — CREATOR and ENTERPRISE keep using the existing
// authenticated checkout path (app/(dashboard)/dashboard/checkout) and
// never create one of these rows. Corporate has no Stripe checkout at all.
export const GUEST_CHECKOUT_PLAN_TYPES = ["MID_MARKET", "SMALL_BUSINESS"] as const;
export type GuestCheckoutPlanType = (typeof GUEST_CHECKOUT_PLAN_TYPES)[number];

export const BILLING_TERMS = ["MONTHLY_12", "MONTHLY_24"] as const;
export type GuestCheckoutBillingTerm = (typeof BILLING_TERMS)[number];

export const createCheckoutDraftSchema = z.object({
  planType: z.enum(GUEST_CHECKOUT_PLAN_TYPES),
  billingTerm: z.enum(BILLING_TERMS),

  email: z
    .string()
    .transform(normalizeEmail)
    .refine((value) => value.length >= 6, {
      message: "Email is required",
    })
    .refine((value) => emailRegex.test(value), {
      message: "Invalid email address",
    }),

  fullName: z
    .string()
    .transform(normalizeName)
    .refine((value) => value.length >= 2, {
      message: "Full name must be at least 2 characters",
    })
    .refine((value) => value.length <= 100, {
      message: "Full name must be 100 characters or less",
    }),

  companyName: z
    .string()
    .trim()
    .max(200, "Company name must be 200 characters or less")
    .optional(),
});

export type CreateCheckoutDraftInput = z.infer<typeof createCheckoutDraftSchema>;
