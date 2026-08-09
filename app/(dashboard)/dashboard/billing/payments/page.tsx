import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { fetchPaymentsForUser } from "@/lib/payments";
import { PaymentHistoryTable } from "@/components/dashboard/payment-history-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Payment History — YouMimic Portal",
};

// Generous single-page cap rather than full pagination — payment history
// for a single customer/enterprise realistically stays well under this for
// years; revisit with real pagination if that stops being true.
const PAYMENT_HISTORY_LIMIT = 200;

export default async function PaymentHistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const payments = await fetchPaymentsForUser(session.user.id, PAYMENT_HISTORY_LIMIT);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/dashboard/billing" className="hover:text-foreground transition-colors">
          Billing
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">Payment History</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payment History</h1>
        <p className="text-muted-foreground">Every payment on your personal and enterprise plans.</p>
      </div>

      <PaymentHistoryTable payments={payments} />
    </div>
  );
}
