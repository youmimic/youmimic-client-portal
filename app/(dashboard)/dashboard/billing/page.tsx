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
import { BillingSupportEmail } from "@/components/dashboard/billing-support-email";
import {
  PlanBadge,
  StatusBadge,
  PaymentStatusBadge,
} from "@/components/billing/status-badges";
import { AvatarBillingBreakdown } from "@/components/dashboard/avatar-billing";

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
        // billingComponent: STANDARD — Phase 1 avatar billing added
        // PLATFORM_FEE/AVATAR_STORAGE rows that must never be picked up here
        // instead of the actual plan-level subscription.
        where: { userId, ownerType: "USER", billingComponent: "STANDARD" },
        orderBy: { updatedAt: "desc" },
        select: {
          planType: true,
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          stripeCustomerId: true,
          billingProvider: true,
          canceledAt: true,
        },
      }),
      prisma.enterprise.findMany({
        where: { ownerUserId: userId },
        select: {
          id: true,
          name: true,
          provisioningMode: true,
          subscriptions: {
            where: { billingComponent: "STANDARD" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              planType: true,
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              stripeCustomerId: true,
              billingProvider: true,
              canceledAt: true,
            },
          },
          avatars: {
            select: {
              id: true,
              name: true,
              billingStatus: true,
              subscriptions: {
                where: { billingComponent: "AVATAR_STORAGE" },
                select: {
                  unitAmountCents: true,
                  currency: true,
                  currentPeriodEnd: true,
                  provisioningFailedAt: true,
                  provisioningFailureMsg: true,
                },
                take: 1,
              },
            },
            orderBy: { createdAt: "asc" },
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

  // Platform Access Fee (Phase 1 avatar billing) — one row per enterprise,
  // fetched separately since it depends on the enterprise ids above and
  // can't share a select with the STANDARD subscriptions query on the same
  // relation.
  const enterpriseIds = ownedEnterprises.map((e) => e.id);
  const platformFees =
    enterpriseIds.length > 0
      ? await prisma.subscription.findMany({
          where: { enterpriseId: { in: enterpriseIds }, billingComponent: "PLATFORM_FEE" },
          select: { enterpriseId: true, unitAmountCents: true, currency: true },
        })
      : [];
  const platformFeeByEnterprise = new Map(
    platformFees.map((f) => [f.enterpriseId, f]),
  );

  return { personalSub, ownedEnterprises, memberEnterprises, recentPayments, platformFeeByEnterprise };
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
  // A missing stripeCustomerId only means "no real subscription" for
  // Stripe-provider rows (e.g. an abandoned checkout). GoCardless-provider
  // rows never have one by design — checking it here would otherwise show a
  // "Subscribe" button to someone who is already an active paying customer.
  const hasRealSub = !!sub && (sub.billingProvider !== "STRIPE" || !!sub.stripeCustomerId);

  if (enterpriseId !== undefined) {
    // Enterprise: self-serve checkout for initial setup only.
    // Once an active subscription exists, changes go through the YouMimic team.
    const noSub =
      !hasRealSub || sub!.status === "CANCELED" || sub!.status === "INCOMPLETE_EXPIRED";

    if (noSub) {
      return {
        action: { type: "checkout", planType: "ENTERPRISE", enterpriseId },
        label: "Subscribe",
        variant: "default",
      };
    }

    if (sub!.status === "INCOMPLETE") {
      return {
        action: { type: "checkout", planType: "ENTERPRISE", enterpriseId },
        label: "Complete checkout",
        variant: "default",
      };
    }

    // Active subscription — ongoing changes via YouMimic sales team.
    return { action: { type: "managed" }, label: "", variant: "outline" };
  }

  // Personal plan (CREATOR) — fully self-serve, but only for Stripe: the
  // customer portal is a Stripe API call and has no GoCardless equivalent.
  const noPortal =
    !hasRealSub || sub!.status === "CANCELED" || sub!.status === "INCOMPLETE_EXPIRED";

  if (noPortal) {
    return {
      action: { type: "checkout", planType },
      label: "Subscribe",
      variant: "default",
    };
  }

  if (sub!.status === "INCOMPLETE") {
    return {
      action: { type: "checkout", planType },
      label: "Complete checkout",
      variant: "default",
    };
  }

  if (sub!.billingProvider !== "STRIPE") {
    return { action: { type: "managed" }, label: "", variant: "outline" };
  }

  return { action: { type: "portal" }, label: "Manage billing", variant: "outline" };
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

      <CardFooter className="flex-col items-start gap-2">
        <BillingActionButton action={action} label={label} variant={variant} />
        <BillingSupportEmail />
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Enterprise plan card (owner)
// ---------------------------------------------------------------------------

type AvatarBillingRow = {
  id: string;
  name: string;
  billingStatus: "ACTIVE" | "PAUSED" | "ARCHIVED";
  subscriptions: {
    unitAmountCents: number | null;
    currency: string;
    currentPeriodEnd: Date | null;
    provisioningFailedAt: Date | null;
    provisioningFailureMsg: string | null;
  }[];
};

function EnterprisePlanCard({
  enterprise,
  platformFee,
  avatars,
}: {
  enterprise: {
    id: string;
    name: string;
    provisioningMode: "SALES_ASSISTED" | "SELF_SERVE";
    subscriptions: SubData[];
  };
  platformFee?: { unitAmountCents: number | null; currency: string };
  avatars?: AvatarBillingRow[];
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

      <CardContent className="space-y-4">
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

        {(platformFee || (avatars && avatars.length > 0)) && (
          <AvatarBillingBreakdown
            enterpriseId={enterprise.id}
            provisioningMode={enterprise.provisioningMode}
            platformFee={platformFee ?? null}
            avatars={(avatars ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              billingStatus: a.billingStatus,
              subscription: a.subscriptions[0]
                ? {
                    unitAmountCents: a.subscriptions[0].unitAmountCents,
                    currency: a.subscriptions[0].currency,
                    currentPeriodEnd: a.subscriptions[0].currentPeriodEnd?.toISOString() ?? null,
                    provisioningFailedAt: a.subscriptions[0].provisioningFailedAt?.toISOString() ?? null,
                    provisioningFailureMsg: a.subscriptions[0].provisioningFailureMsg,
                  }
                : null,
            }))}
          />
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
          <p className="text-sm text-muted-foreground">
            No payment history yet.
          </p>
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
                      <PaymentStatusBadge status={payment.status} />
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

// Maps known redirect reasons to fixed user-facing copy.
// Only values present here are rendered — arbitrary query text is never displayed.
const REDIRECT_NOTICES: Record<string, string> = {
  "subscription-required":
    "A subscription is required to access Bookings. Subscribe below to get started.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { personalSub, ownedEnterprises, memberEnterprises, recentPayments, platformFeeByEnterprise } =
    await fetchBillingData(session.user.id);

  const isEnterpriseOwner = ownedEnterprises.length > 0;
  const { reason } = await searchParams;
  const redirectNotice = (reason && REDIRECT_NOTICES[reason]) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscriptions and billing details.
        </p>
      </div>

      {redirectNotice && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{redirectNotice}</span>
        </div>
      )}

      {/* Personal plan — hidden for enterprise-owner accounts */}
      {!isEnterpriseOwner && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Personal plan
          </h2>
          <PersonalPlanCard sub={personalSub} />
        </section>
      )}

      {/* Owned enterprises */}
      {ownedEnterprises.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Enterprise plans
          </h2>
          <div className="space-y-4">
            {ownedEnterprises.map((enterprise) => (
              <EnterprisePlanCard
                key={enterprise.id}
                enterprise={enterprise}
                platformFee={platformFeeByEnterprise.get(enterprise.id)}
                avatars={enterprise.avatars}
              />
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
