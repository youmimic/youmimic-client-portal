import { z } from "zod";

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "BILLING_ADMIN"] as const;
const ADMIN_ROLE_FILTER = [...ADMIN_ROLES, "all"] as const;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  adminRole: z.enum(ADMIN_ROLE_FILTER).default("all"),
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
