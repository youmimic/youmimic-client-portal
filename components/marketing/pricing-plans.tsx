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

type BillingTerm = "12" | "24";

// Real, confirmed pricing (glassengine.wixstudio.com/youmimicai) — not
// placeholders. Corporate is a flat monthly rate regardless of term; Mid
// Market and Small Business each have distinct price/avatar-count per
// 12-month vs 24-month commitment.
const corporate = {
  name: "Corporate",
  tagline: "For large organizations using AI avatars across every department.",
  price: "$4,999 p/m",
  features: [
    "Unlimited avatars",
    "Priority video processing",
    "Brand governance controls",
    "Dedicated account manager",
  ],
  cta: "Book Now",
};

const byTerm: Record<
  BillingTerm,
  {
    midMarket: { avatars: string; price: string };
    smallBusiness: { avatars: string; price: string };
  }
> = {
  "12": {
    midMarket: { avatars: "10 avatars", price: "$2,499 p/m" },
    smallBusiness: { avatars: "2 avatars", price: "$899 p/m" },
  },
  "24": {
    midMarket: { avatars: "5 avatars", price: "$1,499 p/m" },
    smallBusiness: { avatars: "3 avatars", price: "$499 p/m" },
  },
};

export function PricingPlans() {
  const [term, setTerm] = useState<BillingTerm>("12");
  const t = byTerm[term];

  return (
    <div className="space-y-8">
      {/* Billing term toggle — Mid Market and Small Business pricing/avatar
          counts change with commitment length; Corporate is a flat rate. */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          {(["12", "24"] as const).map((value) => (
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
              {value} months
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
            <p className="mb-4 text-lg font-semibold text-foreground">{corporate.price}</p>
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
            <Button asChild variant="outline" className="w-full">
              <Link href="/contact#book-demo">{corporate.cta}</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col ring-2 ring-primary">
          <CardHeader>
            <span className="mb-2 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              Most popular
            </span>
            <CardTitle className="text-base">Mid Market</CardTitle>
            <CardDescription>
              For growing teams scaling AI video communication across departments.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{t.midMarket.price}</p>
            <ul className="space-y-2">
              {[t.midMarket.avatars, "Priority video processing", "Multilingual generation", "Email + chat support"].map(
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
              <Link href="/contact#book-demo">Book Now</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Small Business</CardTitle>
            <CardDescription>For individuals and focused teams getting started with AI video.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{t.smallBusiness.price}</p>
            <ul className="space-y-2">
              {[t.smallBusiness.avatars, "Core video generation", "Standard processing queue", "Email support"].map(
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
              <Link href="/contact#book-demo">Book Now</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
