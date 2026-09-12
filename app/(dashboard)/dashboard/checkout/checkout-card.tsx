"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { BillingActionButton } from "@/components/dashboard/billing-actions";
import {
  PlanTermHeaderFields,
  PlanTermDetailFields,
  type CheckoutPlanKey,
} from "@/components/checkout/plan-term-fields";
import type { BillingTermKey } from "@/lib/pricing/plans";

// Owns the plan/term selection state for the authenticated confirm-and-pay
// page. Switching here is instant and purely local — nothing is created
// server-side until "Proceed to payment" is actually clicked, so there's
// no cost to letting the buyer freely compare plans/terms in place instead
// of being sent back to /pricing and losing their spot.
export function CheckoutCard({
  initialPlan,
  initialTerm,
}: {
  initialPlan: CheckoutPlanKey;
  initialTerm: BillingTermKey;
}) {
  const [plan, setPlan] = useState<CheckoutPlanKey>(initialPlan);
  const [term, setTerm] = useState<BillingTermKey>(initialTerm);

  return (
    <Card>
      <CardHeader>
        <PlanTermHeaderFields plan={plan} onPlanChange={setPlan} />
      </CardHeader>
      <CardContent className="space-y-4">
        <PlanTermDetailFields plan={plan} term={term} onTermChange={setTerm} />
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
      </CardFooter>
    </Card>
  );
}
