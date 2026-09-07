import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteLogo } from "@/components/branding/site-logo";
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

// Footer link style — explicit light-on-dark colors rather than theme
// tokens, since this footer is permanently dark (#333333) regardless of
// the site's light/dark theme setting. `hover:!text-white` uses Tailwind's
// important modifier since a plain hover class can't override the inline
// `style.color` below (inline style always wins over a stylesheet rule
// unless that rule is !important) — same technique used for the button
// hover-invert.
const linkClassName = "text-sm transition-colors hover:!text-white";
const linkStyle = { color: "rgba(255,255,255,0.7)" };

export function MarketingFooter() {
  return (
    <footer style={{ backgroundColor: "#333333" }}>
      <div className="mx-auto w-full px-4 py-12 sm:px-6 lg:w-[90vw] lg:px-0">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <SiteLogo forceVariant="dark" />
            <p className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
              You Mimic Pty Ltd
              <br />
              ABN: 39 695 563 627
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#FFFFFF" }}>
              Company
            </h3>
            <ul className="space-y-2">
              {companyLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className={linkClassName} style={linkStyle}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#FFFFFF" }}>
              Navigation
            </h3>
            <ul className="space-y-2">
              {navigationLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className={linkClassName} style={linkStyle}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "#FFFFFF" }}>
              Social
            </h3>
            {socialLinks.length > 0 && (
              <ul className="space-y-2">
                {socialLinks.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 ${linkClassName}`}
                      style={linkStyle}
                    >
                      <ArrowUpRight className="size-4" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {/* Newsletter signup — same column as Social, directly below
                the social links. Intentionally not gated on socialLinks
                being non-empty; the two are unrelated features that
                happen to share a column. */}
            <div className={socialLinks.length > 0 ? "mt-6" : undefined}>
              <NewsletterForm />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
