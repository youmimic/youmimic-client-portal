"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  // Public review page; redirects an authenticated visitor to /dashboard/checkout.
  return `/checkout?plan=${planType}&term=${term}`;
}

export function PricingPlans() {
  const [term, setTerm] = useState<BillingTermKey>("MONTHLY_24");
  const midMarketTier = midMarket.byTerm[term];
  const smallBusinessTier = smallBusiness.byTerm[term];

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          {[
            { value: "MONTHLY_24" as const, label: "24 months" },
            { value: "MONTHLY_12" as const, label: "12 months" },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTerm(value)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                term === value
                  ? "shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={
                term === value
                  ? { backgroundColor: "#333333", color: "#FFFFFF" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col">
          <Image
            src="/corporate.avif"
            alt={corporate.name}
            width={420}
            height={420}
            className="aspect-video w-full object-cover object-top"
          />
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight">{corporate.name}</CardTitle>
            <CardDescription>{corporate.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">
              {corporate.priceDisplay}
            </p>
            <ul className="space-y-2">
              {corporate.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/contact#book-demo">Contact Sales</Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Badge is a sibling of Card (not a child) so Card's overflow-hidden doesn't clip it. */}
        <div className="relative pt-3">
          <span className="absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground shadow-sm">
            Most popular
          </span>
          <Card className="flex h-full flex-col ring-2 ring-primary">
            <Image
              src="/mid-market.avif"
              alt={midMarket.name}
              width={420}
              height={420}
              className="aspect-video w-full object-cover"
            />
            <CardHeader>
              <CardTitle className="text-2xl font-bold tracking-tight">{midMarket.name}</CardTitle>
              <CardDescription>{midMarket.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="mb-4 text-lg font-semibold text-foreground">
                {midMarketTier.priceDisplay}
              </p>
              <ul className="space-y-2">
                {[
                  midMarketTier.avatars,
                  "Priority video processing",
                  "Multilingual generation",
                  "Email + chat support",
                ].map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href={bookNowHref("MID_MARKET", term)}>
                  Get Started
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="flex flex-col">
          <Image
            src="/small-business.avif"
            alt={smallBusiness.name}
            width={420}
            height={420}
            className="aspect-video w-full object-cover"
          />
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight">{smallBusiness.name}</CardTitle>
            <CardDescription>{smallBusiness.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">
              {smallBusinessTier.priceDisplay}
            </p>
            <ul className="space-y-2">
              {[
                smallBusinessTier.avatars,
                "Core video generation",
                "Standard processing queue",
                "Email support",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href={bookNowHref("SMALL_BUSINESS", term)}>
                Get Started
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
