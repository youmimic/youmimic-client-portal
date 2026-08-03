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

export function canCreateUsers(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Editing here means the narrow surface actually exposed (name today) — not
// email (identity-changing, out of scope) and not adminRole, which has its
// own stricter check below.
export function canEditUsers(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Granting/revoking admin roles is its own check, separate from canEditUsers:
// any ADMIN can hand out ADMIN/BILLING_ADMIN, but only a SUPER_ADMIN can grant
// (or revoke) SUPER_ADMIN itself — otherwise a regular ADMIN could mint a
// SUPER_ADMIN and escalate through them.
export function canAssignAdminRole(
  actorRole: AdminRoleValue,
  targetAdminRole: AdminRole | null,
): boolean {
  if (!hasMinRole(actorRole, "ADMIN")) return false;
  if (targetAdminRole === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") return false;
  return true;
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
export function canViewBookings(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Phase B2a: internal notes are append-only (no edit/delete), so this is
// deliberately a separate, narrower permission from canManageBookings below
// (status transitions) rather than reusing one blanket "manage" flag.
export function canManageBookingNotes(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Phase B2b: explicit status-transition actions only (cancel/confirm) — no
// generic "update any field" capability exists, so this permission gates a
// deliberately narrow write surface, not a full booking-edit capability.
export function canManageBookings(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Subscriptions — read-only in v1 (no manage/write routes exist yet, so no
// canManageSubscriptions helper is defined until one is actually needed).
// BILLING_ADMIN minimum, not ADMIN: every other view permission in this file
// requires ADMIN, but BILLING_ADMIN otherwise has no capability anywhere in
// the app today — this is its first real one, and it fits the role's name.
export function canViewSubscriptions(role: AdminRoleValue): boolean {
  return hasMinRole(role, "BILLING_ADMIN");
}

// Enterprise avatar billing (Phase 1) — same ADMIN-minimum tier as
// canManageEnterprises, kept as its own named permission since it gates a
// distinct write surface (contacts, platform fee, avatar storage pricing)
// rather than being folded into the general enterprise-management check.
export function canManageEnterpriseBilling(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canManageEnterpriseContacts(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}

// Phase 2 avatar billing automation — same ADMIN-minimum tier, gates the
// provisioningMode toggle that turns on live Stripe writes for an
// enterprise's avatars.
export function canManageProvisioningMode(role: AdminRoleValue): boolean {
  return hasMinRole(role, "ADMIN");
}
