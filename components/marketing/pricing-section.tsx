import type { ReactNode } from "react";
import { PricingPlans } from "@/components/marketing/pricing-plans";

// Single shared "Pricing" section — heading, subhead, and the plan cards —
// used by both the homepage's Pricing section and the standalone /pricing
// page, so the two never have to be kept in sync by hand. `id` supports
// the homepage's "See Pricing" scroll-to-anchor link; `banner` lets a page
// (e.g. /pricing's subscription-required notice) inject page-specific
// content above the heading without duplicating the section itself.
export function PricingSection({
  id,
  banner,
}: {
  id?: string;
  banner?: ReactNode;
} = {}) {
  return (
    <section id={id} className={id ? "scroll-mt-20 py-24 sm:py-32" : "py-24 sm:py-32"}>
      <div className="mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
        {banner}
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Transparent, flexible pricing
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
            Start with one avatar. Add more as you grow.
          </p>
        </div>
        <PricingPlans />
      </div>
    </section>
  );
}
