import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

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
