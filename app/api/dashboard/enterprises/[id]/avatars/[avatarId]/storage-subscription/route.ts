import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import {
  provisionAvatarStorageSubscription,
  cancelAvatarStorageSubscription,
} from "@/lib/stripe/avatar-billing";

async function loadOwnedSelfServeContext(enterpriseId: string, avatarId: string, userId: string) {
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true, ownerUserId: true, provisioningMode: true },
  });
  if (!enterprise) return { error: NextResponse.json({ error: "Enterprise not found" }, { status: 404 }) };
  if (enterprise.ownerUserId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (enterprise.provisioningMode !== "SELF_SERVE") {
    return {
      error: NextResponse.json(
        { error: "This enterprise is managed by the YouMimic team — contact your account manager to change avatars." },
        { status: 403 },
      ),
    };
  }

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, enterpriseId }, select: { id: true } });
  if (!avatar) return { error: NextResponse.json({ error: "Avatar not found on this enterprise" }, { status: 404 }) };

  return { enterprise };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: enterpriseId, avatarId } = await params;
  const { error } = await loadOwnedSelfServeContext(enterpriseId, avatarId, session.user.id);
  if (error) return error;

  const result = await provisionAvatarStorageSubscription(enterpriseId, avatarId);
  if (!result.ok) {
    const status = result.code === "STRIPE_ERROR" ? 502 : 422;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "provision_avatar_subscription",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: result.subscriptionId,
    metadata: { enterpriseId, avatarId, actor: "enterprise_owner" },
  });

  return NextResponse.json({ subscriptionId: result.subscriptionId }, { status: 201 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: enterpriseId, avatarId } = await params;
  const { error } = await loadOwnedSelfServeContext(enterpriseId, avatarId, session.user.id);
  if (error) return error;

  const existing = await prisma.subscription.findUnique({
    where: { avatarId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "No storage subscription found for this avatar" }, { status: 404 });
  }

  const result = await cancelAvatarStorageSubscription(existing.id);
  if (!result.ok) {
    const status = result.code === "STRIPE_ERROR" ? 502 : 404;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "cancel_avatar_subscription",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: existing.id,
    metadata: { enterpriseId, avatarId, actor: "enterprise_owner" },
  });

  return NextResponse.json({ ok: true });
}
