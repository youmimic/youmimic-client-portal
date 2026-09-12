"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  PlanTermHeaderFields,
  PlanTermDetailFields,
  type CheckoutPlanKey,
} from "@/components/checkout/plan-term-fields";
import type { BillingTermKey } from "@/lib/pricing/plans";
import { GuestCheckoutForm } from "./guest-checkout-form";

// Owns the plan/term selection state for the guest checkout review page.
// Switching plan or term here is instant and purely local — nothing is
// created server-side (no CheckoutDraft) until the buyer submits the form
// below, so there's no cost to letting them freely compare options without
// losing whatever they've already typed into the form.
export function CheckoutCard({
  initialPlan,
  initialTerm,
  resumeDraftId,
  initialEmail,
  initialFullName,
  initialCompanyName,
}: {
  initialPlan: CheckoutPlanKey;
  initialTerm: BillingTermKey;
  // Present when this page was reached via a reminder email's resume link —
  // see app/checkout/page.tsx, which looks up the still-open draft
  // server-side and passes its stored details down here to prefill the
  // form below instead of making the buyer retype everything.
  resumeDraftId?: string;
  initialEmail?: string;
  initialFullName?: string;
  initialCompanyName?: string;
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
        <GuestCheckoutForm
          planType={plan}
          billingTerm={term}
          resumeDraftId={resumeDraftId}
          initialEmail={initialEmail}
          initialFullName={initialFullName}
          initialCompanyName={initialCompanyName}
        />
      </CardFooter>
    </Card>
  );
}
