import { z } from "zod";

// Same rules as lib/validations/auth.ts's private normalizeEmail/emailRegex —
// duplicated narrowly here rather than exported from that file, since these
// are admin-authored inputs (create/invite a user) not end-user auth forms.
const adminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(6, "Email is required")
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Invalid email address",
  });

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "BILLING_ADMIN"] as const;
const ADMIN_ROLE_FILTER = [...ADMIN_ROLES, "all"] as const;

// Not a Prisma enum — EnterpriseMember.roleId points at a Role row whose
// `name` is one of these two strings (see lib/auth/register-user.ts and
// app/api/invites/route.ts, the two places that upsert them).
export const ENTERPRISE_MEMBER_ROLES = ["owner", "member"] as const;
const ENTERPRISE_ROLE_FILTER = [...ENTERPRISE_MEMBER_ROLES, "all"] as const;

export const USER_TYPE_FILTER = ["all", "admin", "enterprise"] as const;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  userType: z.enum(USER_TYPE_FILTER).default("all"),
  adminRole: z.enum(ADMIN_ROLE_FILTER).default("all"),
  enterpriseRole: z.enum(ENTERPRISE_ROLE_FILTER).default("all"),
  isSuspended: z.enum(["true", "false", "all"]).default("all"),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// suspend requires a reason
export const suspendUserSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

// reactivate and revoke-sessions accept an optional reason for the audit log
export const adminActionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// Admin-created user: name + email only. No password field — the account is
// created without a usable password and the person sets their own via an
// emailed set-password link (reuses the forgot-password token flow).
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: adminEmailSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Admin edit of an existing user. `name` and `adminRole` are independently
// optional so a caller can send just one; `adminRole: null` explicitly means
// "revoke admin access" (distinct from omitting the field, which means "leave
// as-is"), hence `.nullable().optional()` rather than plain `.optional()`.
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  adminRole: z.enum(ADMIN_ROLES).nullable().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const PLAN_TYPES = ["FREE", "CREATOR", "ENTERPRISE"] as const;
const PLAN_TYPE_FILTER = [...PLAN_TYPES, "all"] as const;

export const SUBSCRIPTION_STATUSES = [
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "UNPAID",
  "CANCELED",
  "PAUSED",
] as const;
const SUBSCRIPTION_STATUS_FILTER = [...SUBSCRIPTION_STATUSES, "none", "all"] as const;

export const listEnterprisesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUS_FILTER).default("all"),
  planType: z.enum(PLAN_TYPE_FILTER).default("all"),
  sortBy: z.enum(["name", "createdAt", "ownerEmail"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListEnterprisesQuery = z.infer<typeof listEnterprisesQuerySchema>;

// Admin-created enterprise: name + an existing user's email to own it (an
// admin filling out this form knows the owner's email, not their internal
// user id). Creating a new owner user inline is out of scope — create the
// user first, then the enterprise, as two separate steps.
export const createEnterpriseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  ownerEmail: adminEmailSchema,
});

export type CreateEnterpriseInput = z.infer<typeof createEnterpriseSchema>;

// Admin edit of an existing enterprise — name only. Status changes go through
// the dedicated suspend/reactivate actions below (same reason-required
// convention as user suspension), not this generic edit.
export const updateEnterpriseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
});

export type UpdateEnterpriseInput = z.infer<typeof updateEnterpriseSchema>;

// Enterprise suspension blocks portal access for every member, not just one
// account — reason required, same as suspendUserSchema.
export const suspendEnterpriseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

export type SuspendEnterpriseInput = z.infer<typeof suspendEnterpriseSchema>;

// ---------------------------------------------------------------------------
// Enterprise avatar billing (Phase 1 — data model + manual/admin-driven
// billing; see updates/2026-07-27-enterprise-avatar-billing-phase1.md)
// ---------------------------------------------------------------------------

export const ENTERPRISE_CONTACT_TYPES = ["BILLING", "KEY_CONTACT"] as const;

export const addEnterpriseContactSchema = z.object({
  type: z.enum(ENTERPRISE_CONTACT_TYPES),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: adminEmailSchema.optional(),
  phone: z.string().trim().max(50).optional(),
});

export type AddEnterpriseContactInput = z.infer<typeof addEnterpriseContactSchema>;

// All fields independently optional so a caller can update just one.
// email/phone use .nullable() (not just .optional()) so a caller can
// explicitly clear a value — omitting the field means "leave as-is",
// sending null means "remove it".
export const updateEnterpriseContactSchema = z.object({
  type: z.enum(ENTERPRISE_CONTACT_TYPES).optional(),
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  email: adminEmailSchema.nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
});

export type UpdateEnterpriseContactInput = z.infer<typeof updateEnterpriseContactSchema>;

// Mirrors the BillingProvider enum in prisma/schema.prisma.
export const BILLING_PROVIDERS = ["STRIPE", "GOCARDLESS"] as const;

export const AVATAR_BILLING_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;

const optionalIsoDate = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date")
  .nullable()
  .optional();

// Upserts the enterprise's single PLATFORM_FEE Subscription row.
// unitAmountCents explicitly allows 0 (a real, negotiated $0 platform fee —
// not the same as "not yet priced", which is why the underlying column is
// nullable but this input requires an actual number once submitted).
export const setPlatformFeeSchema = z.object({
  unitAmountCents: z.number().int().min(0, "Amount cannot be negative"),
  currency: z.string().trim().length(3).default("AUD"),
  billingProvider: z.enum(BILLING_PROVIDERS).default("STRIPE"),
  stripeCustomerId: z.string().trim().min(1).optional(),
  gocardlessCustomerId: z.string().trim().min(1).optional(),
});

export type SetPlatformFeeInput = z.infer<typeof setPlatformFeeSchema>;

// Creates one avatar's AVATAR_STORAGE Subscription row. unitAmountCents
// defaults to 9900 ($99.00) but is always a real, editable field — per-avatar
// pricing genuinely varies (confirmed: two avatars at $99, a third at $10 on
// the same enterprise), so nothing here should ever be treated as a fixed
// constant by the caller.
export const createAvatarStorageSubscriptionSchema = z.object({
  unitAmountCents: z.number().int().min(0).default(9900),
  currency: z.string().trim().length(3).default("AUD"),
  billingProvider: z.enum(BILLING_PROVIDERS).default("STRIPE"),
  stripeCustomerId: z.string().trim().min(1).optional(),
  stripeSubscriptionId: z.string().trim().min(1).optional(),
  gocardlessCustomerId: z.string().trim().min(1).optional(),
  currentPeriodEnd: optionalIsoDate,
});

export type CreateAvatarStorageSubscriptionInput = z.infer<
  typeof createAvatarStorageSubscriptionSchema
>;

// billingStatus here also drives Avatar.billingStatus (the two are kept in
// sync by the route handler, not by a DB trigger) — pausing/archiving here
// is what the Billing Breakdown total's period-end drop-off logic reads.
export const updateAvatarStorageSubscriptionSchema = z.object({
  unitAmountCents: z.number().int().min(0).optional(),
  billingStatus: z.enum(AVATAR_BILLING_STATUSES).optional(),
  currentPeriodEnd: optionalIsoDate,
  stripeSubscriptionId: z.string().trim().min(1).nullable().optional(),
  gocardlessCustomerId: z.string().trim().min(1).nullable().optional(),
});

export type UpdateAvatarStorageSubscriptionInput = z.infer<
  typeof updateAvatarStorageSubscriptionSchema
>;

// ---------------------------------------------------------------------------
// Enterprise avatar billing (Phase 2 — automated Stripe writes for
// self-serve enterprises)
// ---------------------------------------------------------------------------

export const PROVISIONING_MODES = ["SALES_ASSISTED", "SELF_SERVE"] as const;

export const setProvisioningModeSchema = z.object({
  provisioningMode: z.enum(PROVISIONING_MODES),
});

export type SetProvisioningModeInput = z.infer<typeof setProvisioningModeSchema>;

// ---------------------------------------------------------------------------
// Avatar linking (admin) — creates/edits the base Avatar record itself.
// Avatars remain platform-provisioned: the actual avatar is created and
// trained directly in HeyGen; this just links the resulting avatar/look ID
// (and an optional owning enterprise) into the portal so the customer
// dashboard can display it and sync its live status.
// ---------------------------------------------------------------------------

export const linkAvatarSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  heygenAvatarId: z.string().trim().min(1).max(200).optional(),
  enterpriseId: z.string().trim().min(1).optional(),
});

export type LinkAvatarInput = z.infer<typeof linkAvatarSchema>;

// All fields independently optional so a caller can update just one.
// enterpriseId/heygenAvatarId use .nullable() so a caller can explicitly
// clear a value — omitting the field means "leave as-is".
export const updateAvatarSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  heygenAvatarId: z.string().trim().min(1).max(200).nullable().optional(),
  enterpriseId: z.string().trim().min(1).nullable().optional(),
});

export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

// Bulk HeyGen avatar import — defaults to a dry run (preview only) so a
// caller must explicitly opt into actually writing rows.
export const heygenImportSchema = z.object({
  dryRun: z.boolean().default(true),
});

export type HeygenImportInput = z.infer<typeof heygenImportSchema>;

// Import a single avatar identity by HeyGen group id, targeted at a specific
// user — for identities the automated bulk import can't auto-match (no
// workspace code in their look names) or that need routing to a specific
// user an admin already knows. Defaults to a dry run, same as the bulk
// import above.
export const linkAvatarGroupSchema = z.object({
  heygenGroupId: z.string().trim().min(1, "Group ID is required").max(200),
  enterpriseId: z.string().trim().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export type LinkAvatarGroupInput = z.infer<typeof linkAvatarGroupSchema>;

// Mirrors the BillingOwnerType enum in prisma/schema.prisma.
export const BILLING_OWNER_TYPES = ["USER", "ENTERPRISE"] as const;
const OWNER_TYPE_FILTER = [...BILLING_OWNER_TYPES, "all"] as const;

// Reuses PLAN_TYPES / SUBSCRIPTION_STATUSES above (not the enterprises-only
// *_FILTER consts, which include a "none" value that means "no subscription
// at all" — meaningless when listing subscriptions themselves).
const SUB_PLAN_TYPE_FILTER = [...PLAN_TYPES, "all"] as const;
const SUB_STATUS_FILTER = [...SUBSCRIPTION_STATUSES, "all"] as const;

export const listSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Matches stripeSubscriptionId, stripeCustomerId, owner email, or
  // enterprise name — a read-only list filter, not a single-record lookup,
  // so matching multiple rows against a non-unique stripeCustomerId is safe.
  search: z.string().max(200).optional(),
  status: z.enum(SUB_STATUS_FILTER).default("all"),
  planType: z.enum(SUB_PLAN_TYPE_FILTER).default("all"),
  ownerType: z.enum(OWNER_TYPE_FILTER).default("all"),
  sortBy: z.enum(["createdAt", "currentPeriodEnd", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;

// Enterprise ownership transfer — reason required (surfaced in the audit log
// and to the new/old owner if we ever notify them).
export const transferOwnerSchema = z.object({
  newOwnerUserId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

export type TransferOwnerInput = z.infer<typeof transferOwnerSchema>;

// Enterprise member removal — reason required.
export const removeMemberSchema = z.object({
  memberUserId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

// Invite resend — reason optional (this is a low-risk, reversible action).
export const resendInviteSchema = z.object({
  inviteId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export type ResendInviteInput = z.infer<typeof resendInviteSchema>;

// Invite cancellation — reason required.
export const cancelInviteSchema = z.object({
  inviteId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

export type CancelInviteInput = z.infer<typeof cancelInviteSchema>;

// Mirrors the Booking.status enum in prisma/schema.prisma (BookingStatus).
export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;
const BOOKING_STATUS_FILTER = [...BOOKING_STATUSES, "all"] as const;

// "personal" = Booking.enterpriseId is null, "enterprise" = it isn't.
const BOOKING_KIND_FILTER = ["personal", "enterprise", "all"] as const;

const isoDateString = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date");

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(BOOKING_STATUS_FILTER).default("all"),
  kind: z.enum(BOOKING_KIND_FILTER).default("all"),
  sortBy: z.enum(["requestedDate", "createdAt"]).default("requestedDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  // Filters on Booking.requestedDate — optional, only applied if provided.
  dateFrom: isoDateString.optional(),
  dateTo: isoDateString.optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

// Internal admin note on a booking — required, capped generously since these
// are free-text support annotations (not a short "reason" field).
export const addBookingNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Note is required")
    .max(2000, "Note must be 2000 characters or less"),
});

export type AddBookingNoteInput = z.infer<typeof addBookingNoteSchema>;

// Shared by both admin booking status-transition routes (cancel, confirm) —
// same shape as suspendUserSchema (reason required), kept as its own named
// export since it's a distinct concern.
export const bookingStatusActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(500, "Reason must be 500 characters or less"),
});

export type BookingStatusActionInput = z.infer<typeof bookingStatusActionSchema>;

// ---------------------------------------------------------------------------
// Admin sidebar Quick Links
// ---------------------------------------------------------------------------

// Restricted to http/https explicitly (not just z.string().url()) — this URL
// gets rendered straight into an href, and an unrestricted scheme would let
// someone store a javascript: URL.
const quickLinkUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be a valid http:// or https:// URL" },
  );

export const createQuickLinkSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60, "Label must be 60 characters or less"),
  url: quickLinkUrlSchema,
});

export type CreateQuickLinkInput = z.infer<typeof createQuickLinkSchema>;

export const updateQuickLinkSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60).optional(),
  url: quickLinkUrlSchema.optional(),
});

export type UpdateQuickLinkInput = z.infer<typeof updateQuickLinkSchema>;

export const reorderQuickLinksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ReorderQuickLinksInput = z.infer<typeof reorderQuickLinksSchema>;
