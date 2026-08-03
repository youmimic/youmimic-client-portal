import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import stripe from "@/lib/stripe";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageProvisioningMode } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { setProvisioningModeSchema } from "@/lib/validations/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageProvisioningMode(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: enterpriseId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = setProvisioningModeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: { id: true, provisioningMode: true },
  });
  if (!enterprise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { provisioningMode } = parsed.data;

  // Flipping to SELF_SERVE without a payment method on file wouldn't block
  // anything by itself (no avatar can be added yet either way), but the
  // admin should know immediately rather than discovering it via a customer
  // support ticket — so this is a warning in the response, not a rejection.
  let warning: string | null = null;
  if (provisioningMode === "SELF_SERVE") {
    const standardSub = await prisma.subscription.findFirst({
      where: { enterpriseId, ownerType: "ENTERPRISE", billingComponent: "STANDARD" },
      orderBy: { updatedAt: "desc" },
      select: { stripeCustomerId: true },
    });

    if (!standardSub?.stripeCustomerId) {
      warning = "This enterprise has no Stripe customer yet — self-serve avatar billing won't work until they subscribe to an Enterprise plan.";
    } else {
      const customer = await stripe.customers.retrieve(standardSub.stripeCustomerId);
      const hasDefaultPm = !customer.deleted && !!customer.invoice_settings?.default_payment_method;
      const methods = hasDefaultPm
        ? null
        : await stripe.paymentMethods.list({ customer: standardSub.stripeCustomerId, type: "card", limit: 1 });
      if (!hasDefaultPm && (!methods || methods.data.length === 0)) {
        warning = "No payment method on file for this enterprise's Stripe customer yet — self-serve avatar additions will fail until one is added.";
      }
    }
  }

  const updated = await prisma.enterprise.update({
    where: { id: enterpriseId },
    data: { provisioningMode },
    select: { id: true, provisioningMode: true },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "set_enterprise_provisioning_mode",
    entityType: ENTITY_TYPES.ENTERPRISE,
    entityId: enterpriseId,
    metadata: { from: enterprise.provisioningMode, to: provisioningMode },
  });

  return NextResponse.json({ enterprise: updated, warning });
}
