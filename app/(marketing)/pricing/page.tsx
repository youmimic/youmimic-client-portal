import type { Metadata } from "next";
import { PricingSection } from "@/components/marketing/pricing-section";

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
    <PricingSection
      banner={
        isGated ? (
          <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            An active subscription is required to access that feature. Choose a
            plan below to continue.
          </div>
        ) : null
      }
    />
  );
}
