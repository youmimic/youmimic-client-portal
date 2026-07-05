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
