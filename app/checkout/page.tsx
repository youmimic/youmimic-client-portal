import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  midMarket,
  smallBusiness,
  TERM_LABEL,
  type BillingTermKey,
} from "@/lib/pricing/plans";
import { GuestCheckoutForm } from "./guest-checkout-form";

export const metadata = {
  title: "Checkout — YouMimic",
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

// Public entry point from the pricing page's Mid Market / Small Business
// "Get Started" buttons — reachable without being logged in. An already
// authenticated visitor is sent straight to the existing (unchanged)
// authenticated confirm-and-pay page, so this file never duplicates that
// page's checkout logic. Corporate never links here (stays "Contact Sales"
// only, no self-serve checkout of any kind).
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; term?: string; draftId?: string }>;
}) {
  const { plan, term } = await searchParams;

  if (!isPlanKey(plan) || !isTermKey(term)) {
    redirect("/pricing");
  }

  const session = await auth();
  if (session?.user) {
    redirect(`/dashboard/checkout?plan=${plan}&term=${term}`);
  }

  const selectedPlan = PLANS[plan];
  const tier = selectedPlan.byTerm[term];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirm your plan</h1>
        <p className="text-muted-foreground">
          Review your selection, then continue to secure payment.
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
          <p className="text-xs text-muted-foreground">
            Recurring monthly charge, billed automatically until cancelled. Taxes may apply at
            checkout depending on your location. You can cancel anytime from your billing
            settings once your account is set up.
          </p>
          <div className="flex items-start gap-2 pt-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>You&apos;ll be redirected to Stripe to complete payment securely.</span>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4">
          <GuestCheckoutForm planType={plan} billingTerm={term} />
          <Button asChild variant="ghost" className="w-full">
            <Link href="/pricing">Choose a different plan</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
