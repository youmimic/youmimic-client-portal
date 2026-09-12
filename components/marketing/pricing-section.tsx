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
    <section
      id={id}
      className={
        id
          ? "relative overflow-hidden scroll-mt-20 py-24 sm:py-32"
          : "relative overflow-hidden py-24 sm:py-32"
      }
    >
      {/* Soft top-center "spotlight" glow — distinct shape/position from
          the corner-pair and single-circle glows used elsewhere on the
          page, so the recurring teal accent reads as varied rather than
          one effect copy-pasted everywhere. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(76,153,151,0.12) 0%, transparent 50%)",
        }}
      />
      <div className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:w-[90vw] lg:px-0">
        {banner}
        <div className="mb-16 text-center">
          <h2 className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
            Simple pricing. <span style={{ color: "#4C9997" }}>Built to scale.</span>
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
