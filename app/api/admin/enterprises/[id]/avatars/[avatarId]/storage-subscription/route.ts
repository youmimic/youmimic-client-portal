import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, BillingProvider } from "@/app/generated/prisma/client";
import { canManageEnterpriseBilling } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { createAvatarStorageSubscriptionSchema } from "@/lib/validations/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseBilling(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId, avatarId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createAvatarStorageSubscriptionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, enterpriseId },
    select: { id: true },
  });
  if (!avatar) {
    return NextResponse.json({ error: "Avatar not found on this enterprise" }, { status: 404 });
  }

  // One Subscription row per avatar (schema-enforced via @@unique([avatarId])
  // too, but checked here first for a clear, actionable error instead of a
  // raw constraint-violation response).
  const existing = await prisma.subscription.findUnique({
    where: { avatarId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          "This avatar already has a storage subscription — use the update endpoint instead of creating a new one.",
        subscriptionId: existing.id,
      },
      { status: 409 },
    );
  }

  const {
    unitAmountCents,
    currency,
    billingProvider,
    stripeCustomerId,
    stripeSubscriptionId,
    gocardlessCustomerId,
    currentPeriodEnd,
  } = parsed.data;

  const subscription = await prisma.subscription.create({
    data: {
      enterpriseId,
      avatarId,
      ownerType: "ENTERPRISE",
      billingComponent: "AVATAR_STORAGE",
      unitAmountCents,
      currency,
      billingProvider: billingProvider as BillingProvider,
      status: "ACTIVE",
      planType: "ENTERPRISE",
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: stripeSubscriptionId ?? null,
      gocardlessCustomerId: gocardlessCustomerId ?? null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
    select: {
      id: true,
      unitAmountCents: true,
      currency: true,
      billingProvider: true,
      currentPeriodEnd: true,
    },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_avatar_subscription",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: subscription.id,
    metadata: { enterpriseId, avatarId, unitAmountCents, currency, billingProvider },
  });

  return NextResponse.json({ subscription }, { status: 201 });
}
