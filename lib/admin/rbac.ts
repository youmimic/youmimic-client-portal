import type { AdminRole } from "@/app/generated/prisma/client";

type AdminRoleValue = AdminRole | null | undefined;

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  BILLING_ADMIN: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

function hasMinRole(role: AdminRoleValue, min: AdminRole): boolean {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min];
}

export function canViewUsers(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canSuspendUser(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canReactivateUser(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canRevokeSessions(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canViewAuditLog(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Guards cross-role actions. Enforced at the API layer (not just UI):
// - non-SUPER_ADMINs cannot act on SUPER_ADMIN targets
// - actors cannot act on themselves (checked separately with actor === target ID)
export function canActOnUser(
  actorRole: AdminRoleValue,
  targetRole: AdminRoleValue,
): boolean {
  if (!actorRole) return false;
  if (targetRole === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") return false;
  return true;
}

// Enterprise permissions — maps to ADMIN minimum (same tier as user management).
// BILLING_ADMIN can view enterprise data but cannot create/edit/delete enterprises or members.
export function canViewEnterprises(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canManageEnterprises(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canManageEnterpriseMembers(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Booking permissions — ADMIN minimum, same tier as users/enterprises view access.
// Phase B1 is read-only; there is no canManageBookings yet (no mutation routes exist).
export function canViewBookings(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}
