"use client";

import { useEffect } from "react";
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
import { formatCurrencyCents } from "@/lib/format";
import { AVATAR_STORAGE_MONTHLY_CENTS, TERM_LABEL, type BillingTermKey } from "@/lib/pricing/plans";
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
  avatarCount,
  onTermChange,
  onAvatarCountChange,
}: {
  plan: CheckoutPlanKey;
  term: BillingTermKey;
  avatarCount: number;
  onTermChange: (term: BillingTermKey) => void;
  onAvatarCountChange: (count: number) => void;
}) {
  const tier = CHECKOUT_PLANS[plan].byTerm[term];
  const avatarOptions = Array.from({ length: tier.maxAvatars }, (_, i) => i + 1);

  // Switching plan/term can lower the max below the previously chosen
  // count (e.g. Mid Market 24mo allows 5, 12mo allows 10) — clamp rather
  // than let a stale, now-invalid count silently reach checkout.
  useEffect(() => {
    if (avatarCount > tier.maxAvatars) onAvatarCountChange(tier.maxAvatars);
  }, [tier.maxAvatars, avatarCount, onAvatarCountChange]);

  const avatarsCents = AVATAR_STORAGE_MONTHLY_CENTS * avatarCount;
  const totalCents = tier.priceCents + avatarsCents;

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

      <div className="space-y-2">
        <Label htmlFor="checkout-avatar-count" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Avatars
        </Label>
        <Select
          value={String(avatarCount)}
          onValueChange={(v) => onAvatarCountChange(Number(v))}
        >
          <SelectTrigger id="checkout-avatar-count" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {avatarOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} {n === 1 ? "avatar" : "avatars"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Up to {tier.maxAvatars} on this plan. Each avatar is {formatCurrencyCents(AVATAR_STORAGE_MONTHLY_CENTS)}/month.
        </p>
      </div>

      <div className="space-y-1 border-t pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Platform fee</span>
          <span className="text-sm font-medium text-foreground">{tier.priceDisplay}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Avatars ({avatarCount} &times; {formatCurrencyCents(AVATAR_STORAGE_MONTHLY_CENTS)})
          </span>
          <span className="text-sm font-medium text-foreground">{formatCurrencyCents(avatarsCents)}/mo</span>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-semibold text-foreground">{formatCurrencyCents(totalCents)}/mo</span>
        </div>
      </div>
    </>
  );
}
