import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

// Only platforms with a confirmed real URL are rendered — no placeholder
// or guessed social links. Add more here as real URLs are confirmed.
// Note: lucide-react no longer ships brand/logo icons (Facebook, LinkedIn,
// Twitter, YouTube were removed from the package over trademark concerns),
// so every entry uses the same generic external-link glyph rather than
// pulling in a separate icon package for this alone.
const allSocialLinks = [
  { label: "LinkedIn", href: "https://www.linkedin.com/company/you-mimic/posts/?feedView=all" },
  { label: "Twitter", href: null },
  { label: "Facebook", href: "https://www.facebook.com/youmimicai" },
  { label: "YouTube", href: null },
];
const socialLinks = allSocialLinks.filter(
  (social): social is (typeof allSocialLinks)[number] & { href: string } => social.href !== null,
);

const companyLinks = [
  { label: "Press", href: "/press" },
  { label: "Dataroom", href: "/dataroom" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy-policy.pdf" },
  { label: "Business Terms", href: "/terms-of-business.pdf" },
  { label: "AI Ethics", href: "/ai-ethics" },
  { label: "Media Center", href: "/media-center" },
  { label: "Careers", href: "/careers" },
];

const navigationLinks = [
  { label: "Solutions", href: "/solutions" },
  { label: "Small Business", href: "/solutions/small-business" },
  { label: "Plans", href: "/pricing" },
  { label: "Connect", href: "/contact" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-2">
              {companyLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Navigation</h3>
            <ul className="space-y-2">
              {navigationLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {socialLinks.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Social</h3>
              <ul className="space-y-2">
                {socialLinks.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowUpRight className="size-4" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>

              {/* Newsletter signup — same column as Social, directly below
                  the social links. */}
              <div className="mt-6">
                <NewsletterForm />
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <span>© 2026 YouMimic. All rights reserved.</span>
            <span className="text-xs">ABN 39 695 563 627</span>
          </div>
          <div className="flex gap-6">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-foreground">
              Get started
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
