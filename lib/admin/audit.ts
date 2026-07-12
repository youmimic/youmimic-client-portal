import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

// Canonical entityType values for AdminLog records.
// Always use these constants when calling writeAuditLog to keep entityType
// consistent across routes and queryable in the audit log UI.
export const ENTITY_TYPES = {
  USER: "user",
  ENTERPRISE: "enterprise",
  ENTERPRISE_MEMBER: "enterprise_member",
  ENTERPRISE_INVITE: "enterprise_invite",
  // Registered ahead of Phase B2 (booking mutations) so the admin booking
  // detail route can already query for it consistently. No writes use this
  // value yet — Phase B1 is read-only — so this query always returns empty
  // until B2 ships an admin action that calls writeAuditLog with it.
  BOOKING: "booking",
} as const;

interface AuditLogInput {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  targetUserId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.adminLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      targetUserId: input.targetUserId,
      reason: input.reason,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
