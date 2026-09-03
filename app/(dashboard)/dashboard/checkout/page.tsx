import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BillingActionButton } from "@/components/dashboard/billing-actions";
import {
  midMarket,
  smallBusiness,
  TERM_LABEL,
  type BillingTermKey,
} from "@/lib/pricing/plans";

export const metadata = {
  title: "Confirm your plan — YouMimic Portal",
};

const PLANS = {
  MID_MARKET: midMarket,
  SMALL_BUSINESS: smallBusiness,
} as const;

type PlanKey = keyof typeof PLANS;

function isPlanKey(value: string | undefined): value is PlanKey {
  return value === "MID_MARKET" || value === "SMALL_BUSINESS";
}

function isTermKey(value: string | undefined): value is BillingTermKey {
  return value === "MONTHLY_12" || value === "MONTHLY_24";
}

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

  if (!isPlanKey(plan) || !isTermKey(term)) {
    redirect("/pricing");
  }

  const selectedPlan = PLANS[plan];
  const tier = selectedPlan.byTerm[term];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Confirm your plan</h1>
        <p className="text-muted-foreground">
          Review your selection before proceeding to payment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{selectedPlan.name}</CardTitle>
          <CardDescription>{selectedPlan.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="text-lg font-semibold text-foreground">{tier.priceDisplay}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Billing term</span>
            <span className="text-sm font-medium text-foreground">{TERM_LABEL[term]}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Included</span>
            <span className="text-sm font-medium text-foreground">{tier.avatars}</span>
          </div>
          <div className="flex items-start gap-2 pt-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>You&apos;ll be redirected to Stripe to complete payment securely.</span>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <BillingActionButton
            action={{ type: "checkout", planType: plan, billingTerm: term }}
            label="Proceed to payment"
          />
          <Button asChild variant="ghost" className="w-full">
            <Link href="/pricing">Choose a different plan</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
