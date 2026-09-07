import Link from "next/link";
import { Button } from "@/components/ui/button";

// Shared dark (#333333) closing CTA band — previously hand-duplicated
// across solutions/page.tsx and solutions/small-business/page.tsx with
// only the copy/links changed. Extracted so a future palette/copy tweak
// happens once, same rationale as PricingSection.
export function DarkCtaBand({
  heading,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  heading: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <section
      className="relative overflow-hidden py-24 sm:py-32"
      style={{ backgroundColor: "#333333" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 80% 50%, rgba(76,153,151,0.12) 0%, transparent 60%), " +
            "radial-gradient(ellipse at 20% 80%, rgba(76,153,151,0.15) 0%, transparent 55%)",
        }}
      />
      <div className="relative z-10 mx-auto w-full px-4 text-center sm:px-6 lg:w-[90vw] lg:px-0">
        <h2
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "#FFFFFF" }}
        >
          {heading}
        </h2>
        <p
          className="mx-auto mt-4 max-w-sm text-sm leading-relaxed"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          {body}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            className="h-11 px-6 text-sm font-medium"
            style={{
              backgroundColor: "#4C9997",
              color: "#FFFFFF",
              borderColor: "#4C9997",
            }}
          >
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-11 px-6 text-sm font-medium"
            style={{
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#FFFFFF",
            }}
          >
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
