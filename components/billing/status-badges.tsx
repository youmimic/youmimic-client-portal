// Shared Plan/Subscription/Payment status badges — used by the customer
// billing page (app/(dashboard)/dashboard/billing) and the admin
// subscriptions module (app/(admin)/admin/subscriptions). Extracted so both
// surfaces render the same colors/labels for the same underlying enum
// values instead of drifting apart.

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

export function PlanBadge({ plan }: { plan: string }) {
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

export function StatusBadge({ status }: { status: string }) {
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

export function PaymentStatusBadge({ status }: { status: string }) {
  const cls = PAYMENT_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
