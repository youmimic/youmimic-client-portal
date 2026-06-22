import { redirect } from "next/navigation";
import { AlertTriangle, Building2, Users } from "lucide-react";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
import prisma from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BillingActionButton,
  type BillingAction,
} from "@/components/dashboard/billing-actions";

export const metadata = {
  title: "Billing — YouMimic Portal",
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchBillingData(userId: string) {
  const [personalSub, ownedEnterprises, memberEnterprises, recentPayments] =
    await Promise.all([
      prisma.subscription.findFirst({
        where: { userId, ownerType: "USER" },
        orderBy: { updatedAt: "desc" },
        select: {
          planType: true,
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          stripeCustomerId: true,
          canceledAt: true,
        },
      }),
      prisma.enterprise.findMany({
        where: { ownerUserId: userId },
        select: {
          id: true,
          name: true,
          subscriptions: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              planType: true,
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              stripeCustomerId: true,
              canceledAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.enterpriseMember.findMany({
        where: {
          userId,
          enterprise: { ownerUserId: { not: userId } },
        },
        select: {
          enterprise: {
            select: { id: true, name: true },
          },
        },
        orderBy: { enterprise: { createdAt: "asc" } },
      }),
      // Payment history: personal + enterprise-owner subscription payments.
      // OR[0] — personal plan payments (subscription.userId = userId).
      // OR[1] — enterprise plan payments where this user is the enterprise owner.
      // Non-owner enterprise members are excluded because ownerUserId never
      // matches a member's userId. Receipt links resolve via
      // /api/stripe/invoice-redirect/[invoiceId], which re-validates ownership.
      prisma.payment.findMany({
        where: {
          OR: [
            { subscription: { userId } },
            { subscription: { enterprise: { ownerUserId: userId } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          stripeInvoiceId: true,
          subscription: {
            select: {
              enterprise: {
                select: { name: true },
              },
            },
          },
        },
      }),
    ]);

  return { personalSub, ownedEnterprises, memberEnterprises, recentPayments };
}

type SubData = NonNullable<
  Awaited<ReturnType<typeof fetchBillingData>>["personalSub"]
>;

// ---------------------------------------------------------------------------
// Action resolution
// ---------------------------------------------------------------------------

function resolveAction(
  sub: SubData | null,
  planType: "CREATOR" | "ENTERPRISE",
  enterpriseId?: string,
): { action: BillingAction; label: string; variant: "default" | "outline" } {
  const noPortal =
    !sub ||
    !sub.stripeCustomerId ||
    sub.status === "CANCELED" ||
    sub.status === "INCOMPLETE_EXPIRED";

  if (noPortal) {
    const action: BillingAction =
      enterpriseId !== undefined
        ? { type: "checkout", planType: "ENTERPRISE", enterpriseId }
        : { type: "checkout", planType: "CREATOR" };
    return { action, label: "Subscribe", variant: "default" };
  }

  if (sub.status === "INCOMPLETE") {
    const action: BillingAction =
      enterpriseId !== undefined
        ? { type: "checkout", planType: "ENTERPRISE", enterpriseId }
        : { type: "checkout", planType: "CREATOR" };
    return { action, label: "Complete checkout", variant: "default" };
  }

  const action: BillingAction =
    enterpriseId !== undefined
      ? { type: "portal", enterpriseId }
      : { type: "portal" };
  return { action, label: "Manage billing", variant: "outline" };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const PLAN_STYLES: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground",
  CREATOR: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ENTERPRISE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  CREATOR: "Creator",
  ENTERPRISE: "Enterprise",
};

function PlanBadge({ plan }: { plan: string }) {
  const cls = PLAN_STYLES[plan] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  TRIALING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAST_DUE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  UNPAID: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  INCOMPLETE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  INCOMPLETE_EXPIRED: "bg-muted text-muted-foreground",
  CANCELED: "bg-muted text-muted-foreground",
  PAUSED:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  TRIALING: "Trialing",
  PAST_DUE: "Past due",
  UNPAID: "Unpaid",
  INCOMPLETE: "Incomplete",
  INCOMPLETE_EXPIRED: "Expired",
  CANCELED: "Canceled",
  PAUSED: "Paused",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  unpaid:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Shared card sub-components
// ---------------------------------------------------------------------------

function SubscriptionDetails({ sub }: { sub: SubData }) {
  const showPeriod =
    sub.currentPeriodEnd &&
    !["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PlanBadge plan={sub.planType ?? "FREE"} />
        <StatusBadge status={sub.status ?? "INCOMPLETE"} />
      </div>

      {showPeriod && sub.currentPeriodEnd && (
        <p className="text-sm text-muted-foreground">
          {sub.canceledAt ? "Expires on" : "Renews on"}{" "}
          <span className="font-medium text-foreground">
            {formatDate(sub.currentPeriodEnd)}
          </span>
        </p>
      )}

      {sub.status === "PAST_DUE" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            Payment is past due. Update your payment method to restore access.
          </span>
        </div>
      )}

      {sub.status === "UNPAID" && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            Invoice unpaid. Please update your payment method to reactivate your
            subscription.
          </span>
        </div>
      )}

      {sub.canceledAt &&
        sub.status !== "CANCELED" &&
        sub.status !== "INCOMPLETE_EXPIRED" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Scheduled to cancel at the end of the current billing period.
              Manage billing to reverse this.
            </span>
          </div>
        )}

      {sub.status === "INCOMPLETE" && (
        <p className="text-sm text-muted-foreground">
          Checkout was started but not completed. Click below to finish
          subscribing.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personal plan card
// ---------------------------------------------------------------------------

function PersonalPlanCard({ sub }: { sub: SubData | null }) {
  const { action, label, variant } = resolveAction(sub, "CREATOR");
  const hasActiveSub =
    sub && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Personal plan</CardTitle>
        {!hasActiveSub && (
          <CardDescription>
            Subscribe to a Creator plan to unlock your personal AI avatar and
            booking features.
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {sub &&
        !["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status ?? "") ? (
          <SubscriptionDetails sub={sub} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <PlanBadge plan="FREE" />
            <p className="text-sm text-muted-foreground">
              No active subscription.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <BillingActionButton action={action} label={label} variant={variant} />
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Enterprise plan card (owner)
// ---------------------------------------------------------------------------

function EnterprisePlanCard({
  enterprise,
}: {
  enterprise: {
    id: string;
    name: string;
    subscriptions: SubData[];
  };
}) {
  const sub = enterprise.subscriptions[0] ?? null;
  const { action, label, variant } = resolveAction(
    sub,
    "ENTERPRISE",
    enterprise.id,
  );
  const hasActiveSub =
    sub && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status ?? "");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <CardTitle className="text-base font-semibold">
            {enterprise.name}
          </CardTitle>
        </div>
        {!hasActiveSub && (
          <CardDescription>
            Subscribe to an Enterprise plan to manage billing for this
            organisation.
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {sub &&
        !["CANCELED", "INCOMPLETE_EXPIRED"].includes(sub.status ?? "") ? (
          <SubscriptionDetails sub={sub} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <PlanBadge plan="FREE" />
            <p className="text-sm text-muted-foreground">
              No active subscription.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <BillingActionButton action={action} label={label} variant={variant} />
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Enterprise membership card (read-only)
// ---------------------------------------------------------------------------

function MembershipNoticeCard({
  enterprise,
}: {
  enterprise: { id: string; name: string };
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <CardTitle className="text-base font-semibold">
            {enterprise.name}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Billing for this enterprise is managed by the enterprise owner.
            Contact them to make changes to the subscription.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payment history
// ---------------------------------------------------------------------------

type PaymentRecord = NonNullable<
  Awaited<ReturnType<typeof fetchBillingData>>["recentPayments"]
>[number];

function PaymentHistorySection({ payments }: { payments: PaymentRecord[] }) {
  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No payment history yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Plan
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Invoice
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((payment) => {
                const scope =
                  payment.subscription?.enterprise?.name ?? "Personal";
                return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {payment.subscription?.enterprise ? (
                        <span className="flex items-center gap-1.5">
                          <Building2
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {scope}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Personal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatAmount(payment.amount, payment.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          PAYMENT_STATUS_STYLES[payment.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {payment.stripeInvoiceId ? (
                        <a
                          href={`/api/stripe/invoice-redirect/${payment.stripeInvoiceId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary underline-offset-4 hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { personalSub, ownedEnterprises, memberEnterprises, recentPayments } =
    await fetchBillingData(session.user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscriptions and billing details.
        </p>
      </div>

      {/* Personal plan */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Personal plan
        </h2>
        <PersonalPlanCard sub={personalSub} />
      </section>

      {/* Owned enterprises */}
      {ownedEnterprises.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Enterprise plans
          </h2>
          <div className="space-y-4">
            {ownedEnterprises.map((enterprise) => (
              <EnterprisePlanCard key={enterprise.id} enterprise={enterprise} />
            ))}
          </div>
        </section>
      )}

      {/* Enterprise memberships (non-owner) */}
      {memberEnterprises.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Enterprise memberships
          </h2>
          <div className="space-y-4">
            {memberEnterprises.map(({ enterprise }) => (
              <MembershipNoticeCard
                key={enterprise.id}
                enterprise={enterprise}
              />
            ))}
          </div>
        </section>
      )}

      {/* Payment history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Payment history
        </h2>
        <PaymentHistorySection payments={recentPayments} />
      </section>
    </div>
  );
}
