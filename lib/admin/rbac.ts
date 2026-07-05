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
