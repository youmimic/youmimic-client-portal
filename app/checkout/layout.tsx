import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SiteLogo } from "@/components/branding/site-logo";
import { HEADER_HEIGHT } from "@/components/marketing/marketing-header-config";

// Deliberately minimal — no nav, no sign-in/get-started buttons, unlike
// MarketingHeader. A checkout flow's own header should give the buyer
// exactly two things: brand reassurance (they're still on youmimic.com.au,
// not a random domain) and a way to fix their color scheme, nothing that
// invites them to click away mid-purchase. Same dark bar/height as the
// rest of the site (HEADER_HEIGHT, same background) so navigating here
// from the pricing page doesn't feel like a different product.
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur"
        style={{ backgroundColor: "rgba(51,51,51,0.95)" }}
      >
        {/* Same width convention as MarketingHeader itself (lg:w-[90vw],
            not a fixed max-w-*) — the site doesn't center headers in a
            capped column, it uses 90% of the viewport at lg+. Matching
            this exactly (not just visually approximating it with a
            max-w value) is what keeps the logo in the same screen
            position when navigating here from any other page, e.g.
            /pricing's "Get Started" button — a mismatched convention is
            what made the logo look "off" here even after the first fix. */}
        <div
          className={cn(
            "mx-auto flex w-full items-center justify-between px-4 sm:px-6 lg:w-[90vw] lg:px-0",
            HEADER_HEIGHT,
          )}
        >
          <SiteLogo
            forceVariant="dark"
            iconVariant="light"
            className="flex h-6 w-auto items-center sm:h-7 md:h-8"
          />
          <ThemeToggle className="text-white hover:!text-white hover:bg-white/10" />
        </div>
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </>
  );
}
