import type { Metadata } from "next";
import { PricingPlans } from "@/components/marketing/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing — YouMimic",
  description:
    "Simple, transparent pricing for individuals, enterprises, and custom deployments.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isGated = reason === "subscription-required";

  return (
    <section className="border-b border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {isGated && (
          <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            An active subscription is required to access that feature. Choose a
            plan below to continue.
          </div>
        )}

        <div className="mb-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Transparent, flexible pricing
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Start with a single avatar. Scale as your organization grows.
          </p>
        </div>

        <PricingPlans />
      </div>
    </section>
  );
}
