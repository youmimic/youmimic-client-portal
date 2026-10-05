import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageEnterpriseBilling } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { createAvatarBillingSetupSessionSchema } from "@/lib/validations/admin";
import { createAvatarBillingSetupSession } from "@/lib/stripe/avatar-billing";

// Generates one Stripe Checkout (setup mode) link covering every avatar
// selected — for a SALES_ASSISTED/legacy enterprise with no existing
// Stripe customer. See lib/stripe/avatar-billing.ts for what happens once
// the client completes it. Returns the link for the admin to send
// themselves (e.g. by email) — deliberately not auto-sent from here.
export async function POST(
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

  const parsed = createAvatarBillingSetupSessionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const result = await createAvatarBillingSetupSession(enterpriseId, parsed.data.avatarIds, {
    stripePriceId: parsed.data.stripePriceId,
    billingInterval: parsed.data.billingInterval,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "ALREADY_EXISTS" ? 409 : 502;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_avatar_billing_setup_session",
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: enterpriseId,
    metadata: {
      enterpriseId,
      avatarIds: parsed.data.avatarIds,
      billingInterval: parsed.data.billingInterval ?? "MONTH",
      stripePriceId: parsed.data.stripePriceId ?? null,
    },
  });

  return NextResponse.json({ url: result.url }, { status: 201 });
}
