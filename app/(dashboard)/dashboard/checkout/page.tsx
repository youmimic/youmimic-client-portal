import { redirect } from "next/navigation";
import { isCheckoutPlanKey, isBillingTermKey } from "@/lib/checkout/plan-keys";
import { CheckoutCard } from "./checkout-card";

export const metadata = {
  title: "Confirm your plan — YouMimic Portal",
};

// Reached from the pricing page's Mid Market / Small Business "Book Now"
// buttons, via /signup?callbackUrl=/dashboard/checkout?plan=...&term=... —
// auth-gated for free by proxy.ts's existing /dashboard protection, no
// separate check needed here. Corporate never links here (stays "Contact
// Sales" only), so only these two plan types are handled.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; term?: string }>;
}) {
  const { plan, term } = await searchParams;

  if (!isCheckoutPlanKey(plan) || !isBillingTermKey(term)) {
    redirect("/pricing");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Confirm your plan</h1>
        <p className="text-muted-foreground">
          Review your selection before proceeding to payment. Changed your mind? Pick a
          different plan or billing term right here.
        </p>
      </div>

      <CheckoutCard initialPlan={plan} initialTerm={term} />
    </div>
  );
}
