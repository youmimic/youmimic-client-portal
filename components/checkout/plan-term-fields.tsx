"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TERM_LABEL, type BillingTermKey } from "@/lib/pricing/plans";
import { CHECKOUT_PLANS, type CheckoutPlanKey } from "@/lib/checkout/plan-keys";

export type { CheckoutPlanKey } from "@/lib/checkout/plan-keys";

// 24 months listed first — matches the default on the public pricing page
// (components/marketing/pricing-plans.tsx), where it's also the
// cheaper-per-month, pre-selected option.
const TERM_OPTIONS: BillingTermKey[] = ["MONTHLY_24", "MONTHLY_12"];

// The plan/term picker for the checkout review pages (app/checkout and
// app/(dashboard)/dashboard/checkout) — replaces a "Choose a different
// plan" link that used to send the buyer back to /pricing and lose their
// place. Switching here is instant and local: nothing is submitted to the
// server until the buyer actually proceeds to payment, so there's no
// risk in letting them freely compare plans/terms in place.
//
// Renders the CardHeader's plan name/tagline and the CardContent's
// term/price/avatars rows — the parts that are identical, and identically
// reactive, on both checkout pages. Each page keeps its own state (via
// useState, passed in as plan/term/onPlanChange/onTermChange) and renders
// its own footer CTA below this, since that part genuinely differs
// (guest form vs. authenticated billing button).
export function PlanTermHeaderFields({
  plan,
  onPlanChange,
}: {
  plan: CheckoutPlanKey;
  onPlanChange: (plan: CheckoutPlanKey) => void;
}) {
  const selectedPlan = CHECKOUT_PLANS[plan];

  return (
    <div className="space-y-2">
      <Label
        htmlFor="checkout-plan"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Plan
      </Label>
      <Select value={plan} onValueChange={(v) => onPlanChange(v as CheckoutPlanKey)}>
        <SelectTrigger id="checkout-plan" className="h-11 w-full text-base font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="MID_MARKET">Mid Market</SelectItem>
          <SelectItem value="SMALL_BUSINESS">Small Business</SelectItem>
        </SelectContent>
      </Select>
      <CardDescription>{selectedPlan.tagline}</CardDescription>
    </div>
  );
}

export function PlanTermDetailFields({
  plan,
  term,
  onTermChange,
}: {
  plan: CheckoutPlanKey;
  term: BillingTermKey;
  onTermChange: (term: BillingTermKey) => void;
}) {
  const tier = CHECKOUT_PLANS[plan].byTerm[term];

  return (
    <>
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Billing term
        </span>
        <div
          role="radiogroup"
          aria-label="Billing term"
          className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
        >
          {TERM_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={term === value}
              onClick={() => onTermChange(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                term === value ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              style={term === value ? { backgroundColor: "#333333", color: "#FFFFFF" } : undefined}
            >
              {TERM_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Price</span>
        <span className="text-lg font-semibold text-foreground">{tier.priceDisplay}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Included</span>
        <span className="text-sm font-medium text-foreground">{tier.avatars}</span>
      </div>
    </>
  );
}
