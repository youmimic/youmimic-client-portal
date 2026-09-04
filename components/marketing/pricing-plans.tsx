"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  corporate,
  midMarket,
  smallBusiness,
  type BillingTermKey,
} from "@/lib/pricing/plans";

function bookNowHref(planType: "MID_MARKET" | "SMALL_BUSINESS", term: BillingTermKey): string {
  const checkoutPath = `/dashboard/checkout?plan=${planType}&term=${term}`;
  return `/signup?callbackUrl=${encodeURIComponent(checkoutPath)}`;
}

export function PricingPlans() {
  const [term, setTerm] = useState<BillingTermKey>("MONTHLY_24");
  const midMarketTier = midMarket.byTerm[term];
  const smallBusinessTier = smallBusiness.byTerm[term];

  return (
    <div className="space-y-8">
      {/* Billing term toggle — Mid Market and Small Business pricing/avatar
          counts change with commitment length; Corporate is a flat rate. */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          {([
            { value: "MONTHLY_12" as const, label: "12 months" },
            { value: "MONTHLY_24" as const, label: "24 months" },
          ]).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTerm(value)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                term === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">{corporate.name}</CardTitle>
            <CardDescription>{corporate.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{corporate.priceDisplay}</p>
            <ul className="space-y-2">
              {corporate.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            {/* Corporate deliberately stays "Contact Sales" only — no
                self-serve payment flow, per the product owner's decision. */}
            <Button asChild variant="outline" className="w-full">
              <Link href="/contact#book-demo">Book Now</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col ring-2 ring-primary">
          <CardHeader>
            <span className="mb-2 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              Most popular
            </span>
            <CardTitle className="text-base">{midMarket.name}</CardTitle>
            <CardDescription>{midMarket.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{midMarketTier.priceDisplay}</p>
            <ul className="space-y-2">
              {[midMarketTier.avatars, "Priority video processing", "Multilingual generation", "Email + chat support"].map(
                (feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ),
              )}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href={bookNowHref("MID_MARKET", term)}>Book Now</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">{smallBusiness.name}</CardTitle>
            <CardDescription>{smallBusiness.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{smallBusinessTier.priceDisplay}</p>
            <ul className="space-y-2">
              {[smallBusinessTier.avatars, "Core video generation", "Standard processing queue", "Email support"].map(
                (feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ),
              )}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href={bookNowHref("SMALL_BUSINESS", term)}>Book Now</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
