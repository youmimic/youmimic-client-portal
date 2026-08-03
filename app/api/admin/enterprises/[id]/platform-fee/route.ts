import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole, BillingProvider } from "@/app/generated/prisma/client";
import { canManageEnterpriseBilling } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { setPlatformFeeSchema } from "@/lib/validations/admin";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageEnterpriseBilling(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = setPlatformFeeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true },
  });
  if (!enterprise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { unitAmountCents, currency, billingProvider, stripeCustomerId, gocardlessCustomerId } =
    parsed.data;

  // Exactly one PLATFORM_FEE row per enterprise — update it if it exists,
  // create it otherwise. Not a Prisma-level unique constraint (billingComponent
  // + enterpriseId isn't unique in the schema, since AVATAR_STORAGE rows also
  // carry an enterpriseId indirectly via their avatar), so this is an
  // explicit find-then-write rather than a real upsert().
  const existing = await prisma.subscription.findFirst({
    where: { enterpriseId, billingComponent: "PLATFORM_FEE" },
    select: { id: true },
  });

  const data = {
    enterpriseId,
    ownerType: "ENTERPRISE" as const,
    billingComponent: "PLATFORM_FEE" as const,
    unitAmountCents,
    currency,
    billingProvider: billingProvider as BillingProvider,
    status: "ACTIVE" as const,
    planType: "ENTERPRISE" as const,
    stripeCustomerId: stripeCustomerId ?? null,
    gocardlessCustomerId: gocardlessCustomerId ?? null,
  };

  const subscription = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data,
        select: { id: true, unitAmountCents: true, currency: true, billingProvider: true },
      })
    : await prisma.subscription.create({
        data,
        select: { id: true, unitAmountCents: true, currency: true, billingProvider: true },
      });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "set_enterprise_platform_fee",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: subscription.id,
    metadata: { enterpriseId, unitAmountCents, currency, billingProvider },
  });

  return NextResponse.json({ subscription });
}
