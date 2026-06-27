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

const plans = [
  {
    name: "Creator",
    tagline: "For individuals and focused teams getting started with AI video.",
    price: "Contact us",
    features: [
      "One personal AI avatar",
      "Core video generation",
      "Standard processing queue",
      "Email support",
    ],
    cta: "Get started",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Enterprise",
    tagline:
      "For organizations scaling AI video communication across departments.",
    price: "Custom pricing",
    features: [
      "Multiple avatars per account",
      "Priority video processing",
      "Brand governance controls",
      "Dedicated account manager",
    ],
    cta: "Get started",
    href: "/contact",
    highlight: true,
  },
  {
    name: "Custom",
    tagline: "For regulated industries and complex integration requirements.",
    price: "Talk to us",
    features: [
      "Unlimited avatar accounts",
      "Custom SLA and compliance",
      "API access and integration support",
      "White-glove onboarding",
    ],
    cta: "Contact sales",
    href: "/contact",
    highlight: false,
  },
];

export function PricingPlans() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {plans.map(({ name, tagline, price, features, cta, href, highlight }) => (
        <Card
          key={name}
          className={cn("flex flex-col", highlight && "ring-2 ring-primary")}
        >
          <CardHeader>
            {highlight && (
              <span className="mb-2 self-start rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                Most popular
              </span>
            )}
            <CardTitle className="text-base">{name}</CardTitle>
            <CardDescription>{tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-4 text-lg font-semibold text-foreground">{price}</p>
            <ul className="space-y-2">
              {features.map((feature) => (
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
            <Button
              asChild
              variant={highlight ? "default" : "outline"}
              className="w-full"
            >
              <Link href={href}>{cta}</Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
