import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseBilling } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { updateAvatarStorageSubscriptionSchema } from "@/lib/validations/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string; subId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseBilling(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId, avatarId, subId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = updateAvatarStorageSubscriptionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const existing = await prisma.subscription.findFirst({
    where: { id: subId, enterpriseId, avatarId, billingComponent: "AVATAR_STORAGE" },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { unitAmountCents, billingStatus, currentPeriodEnd, stripeSubscriptionId, gocardlessCustomerId } =
    parsed.data;

  // billingStatus lives on Avatar (it's what the Billing Breakdown total's
  // period-end drop-off logic reads), so keep the two rows in sync here
  // rather than relying on the caller to make two requests.
  const subscription = await prisma.subscription.update({
    where: { id: subId },
    data: {
      ...(unitAmountCents !== undefined ? { unitAmountCents } : {}),
      ...(currentPeriodEnd !== undefined
        ? { currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null }
        : {}),
      ...(stripeSubscriptionId !== undefined ? { stripeSubscriptionId } : {}),
      ...(gocardlessCustomerId !== undefined ? { gocardlessCustomerId } : {}),
    },
    select: {
      id: true,
      unitAmountCents: true,
      currency: true,
      currentPeriodEnd: true,
      stripeSubscriptionId: true,
      gocardlessCustomerId: true,
    },
  });

  if (billingStatus !== undefined) {
    await prisma.avatar.update({
      where: { id: avatarId },
      data: { billingStatus },
      select: { id: true },
    });
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "update_avatar_subscription",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: subId,
    metadata: { enterpriseId, avatarId, ...parsed.data },
  });

  return NextResponse.json({ subscription });
}
