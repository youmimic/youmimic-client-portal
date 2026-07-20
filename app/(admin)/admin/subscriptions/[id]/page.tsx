import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canViewSubscriptions } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PlanBadge,
  StatusBadge,
  PaymentStatusBadge,
} from "@/components/billing/status-badges";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const actorRole = session.user.adminRole as AdminRole;
  if (!canViewSubscriptions(actorRole)) redirect("/dashboard");

  const { id } = await params;

  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
      stripePriceId: true,
      stripeProductId: true,
      planType: true,
      status: true,
      ownerType: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      canceledAt: true,
      trialEndsAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, stripeEmail: true } },
      enterprise: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      payments: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          stripeInvoiceId: true,
          stripePaymentIntentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!subscription) notFound();

  // No write action exists yet (v1 is read-only), so this is always empty
  // today — see the SUBSCRIPTION entity-type comment in lib/admin/audit.ts.
  const auditLog = await prisma.adminLog.findMany({
    where: { entityType: ENTITY_TYPES.SUBSCRIPTION, entityId: subscription.id },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  const ownerDisplay =
    subscription.ownerType === "ENTERPRISE"
      ? subscription.enterprise?.name
      : subscription.user?.name;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link href="/admin" className="hover:text-foreground transition-colors">
          Admin
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <Link
          href="/admin/subscriptions"
          className="hover:text-foreground transition-colors"
        >
          Subscriptions
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">
          {ownerDisplay ?? subscription.id}
        </span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{ownerDisplay ?? "Subscription"}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <PlanBadge plan={subscription.planType} />
          <StatusBadge status={subscription.status} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Subscription ID" value={subscription.id} mono />
            <DetailRow label="Plan Type" value={subscription.planType} />
            <DetailRow label="Status" value={subscription.status} />
            <DetailRow
              label="Owner Type"
              value={subscription.ownerType === "ENTERPRISE" ? "Enterprise" : "User"}
            />
            <DetailRow
              label="Current Period"
              value={
                subscription.currentPeriodStart && subscription.currentPeriodEnd
                  ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`
                  : "—"
              }
            />
            <DetailRow
              label="Cancel at Period End"
              value={subscription.cancelAtPeriodEnd ? "Yes" : "No"}
            />
            {subscription.canceledAt && (
              <DetailRow label="Canceled At" value={formatDate(subscription.canceledAt)} />
            )}
            {subscription.trialEndsAt && (
              <DetailRow label="Trial Ends" value={formatDate(subscription.trialEndsAt)} />
            )}
            <DetailRow label="Created" value={formatDate(subscription.createdAt)} />
            <DetailRow label="Last Updated" value={formatDate(subscription.updatedAt)} />
          </CardContent>
        </Card>

        {/* Ownership */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ownership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {subscription.ownerType === "ENTERPRISE" ? (
              subscription.enterprise ? (
                <>
                  <DetailRow label="Enterprise" value={subscription.enterprise.name} />
                  <DetailRow label="Enterprise ID" value={subscription.enterprise.id} mono />
                  {subscription.enterprise.owner && (
                    <>
                      <DetailRow
                        label="Owner Name"
                        value={subscription.enterprise.owner.name ?? "—"}
                      />
                      <DetailRow
                        label="Owner Email"
                        value={subscription.enterprise.owner.email}
                      />
                    </>
                  )}
                  <div className="pt-1">
                    <Link
                      href={`/admin/enterprises/${subscription.enterprise.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      View enterprise →
                    </Link>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Enterprise-owned, but the enterprise record could not be found.
                </p>
              )
            ) : subscription.user ? (
              <>
                <DetailRow label="Name" value={subscription.user.name ?? "—"} />
                <DetailRow label="Email" value={subscription.user.email} />
                <DetailRow label="User ID" value={subscription.user.id} mono />
                {subscription.user.stripeEmail && (
                  <DetailRow
                    label="Known Stripe Email"
                    value={subscription.user.stripeEmail}
                  />
                )}
                <div className="pt-1">
                  <Link
                    href={`/admin/users/${subscription.user.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    View user →
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                User-owned, but the user record could not be found.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Billing identifiers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <DetailRow
            label="Stripe Subscription ID"
            value={subscription.stripeSubscriptionId ?? "— (not yet linked by webhook)"}
            mono
          />
          <DetailRow label="Stripe Customer ID" value={subscription.stripeCustomerId} mono />
          <DetailRow
            label="Stripe Price ID"
            value={subscription.stripePriceId ?? "—"}
            mono
          />
          <DetailRow
            label="Stripe Product ID"
            value={subscription.stripeProductId ?? "—"}
            mono
          />
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {subscription.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded against this subscription.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Amount</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Invoice
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subscription.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2 pr-4 font-medium tabular-nums">
                        {formatAmount(payment.amount, payment.currency)}
                      </td>
                      <td className="py-2 pr-4">
                        <PaymentStatusBadge status={payment.status} />
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground font-mono text-xs">
                        {payment.stripeInvoiceId ?? "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {formatDate(payment.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin actions recorded for this subscription.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Action</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Performed By
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">
                      Reason
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLog.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {log.adminUser.name ?? log.adminUser.email}
                      </td>
                      <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                        {log.reason ?? "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {log.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`break-all text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
