import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/components/billing/status-badges";
import type { PaymentRecord } from "@/lib/payments";

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

export function PaymentHistoryTable({ payments }: { payments: PaymentRecord[] }) {
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((payment) => {
                const scope = payment.subscription?.enterprise?.name ?? "Personal";
                return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(payment.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      {payment.subscription?.enterprise ? (
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
