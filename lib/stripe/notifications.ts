import "server-only";
import type { AdminRole } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { sendAdminBillingEventEmail } from "@/lib/mailer";
import type { SystemEventType } from "@/lib/stripe/system-event-types";

interface RecordSystemEventInput {
  type: SystemEventType;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  enterpriseId?: string | null;
}

export async function recordSystemEvent(
  input: RecordSystemEventInput,
): Promise<void> {
  await prisma.systemEvent.create({
    data: {
      type: input.type,
      source: input.source,
      message: input.message,
      metadata: input.metadata as never,
      userId: input.userId ?? undefined,
      enterpriseId: input.enterpriseId ?? undefined,
    },
  });
}

export interface SubscriptionOwner {
  userId: string;
  email: string;
  name: string | null;
  enterpriseId: string | null;
}

// Resolves who to notify for a subscription: the user directly for a
// personal subscription, or the enterprise owner for an enterprise-owned
// one (enterprise-owned rows have userId null — see Subscription.ownerType
// in schema.prisma). Returns null rather than throwing for a subscription
// with no resolvable owner, so a webhook handler still already deep into
// updating billing state isn't blocked by a notification-only lookup.
export async function resolveSubscriptionOwner(
  subscriptionId: string,
): Promise<SubscriptionOwner | null> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      user: { select: { id: true, email: true, name: true } },
      enterprise: {
        select: {
          id: true,
          owner: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!sub) return null;

  if (sub.user) {
    return {
      userId: sub.user.id,
      email: sub.user.email,
      name: sub.user.name,
      enterpriseId: null,
    };
  }

  if (sub.enterprise?.owner) {
    return {
      userId: sub.enterprise.owner.id,
      email: sub.enterprise.owner.email,
      name: sub.enterprise.owner.name,
      enterpriseId: sub.enterprise.id,
    };
  }

  return null;
}

const BILLING_ADMIN_ROLES: AdminRole[] = ["BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"];

// Emails every BILLING_ADMIN+ admin in one message — internal team
// distribution, not customer-facing, so exposing admin addresses to each
// other in the To: header is an accepted tradeoff for a small internal
// list (same scale assumption as CONTACT_EMAIL's single-recipient pattern
// elsewhere in this app).
export async function notifyBillingAdmins(input: {
  eventLabel: string;
  summary: string;
  detailsUrl: string;
  idempotencyKey: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { adminRole: { in: BILLING_ADMIN_ROLES } },
    select: { email: true },
  });

  if (admins.length === 0) return;

  await sendAdminBillingEventEmail({
    to: admins.map((a) => a.email),
    eventLabel: input.eventLabel,
    summary: input.summary,
    detailsUrl: input.detailsUrl,
    idempotencyKey: input.idempotencyKey,
  });
}
