import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteLogo } from "@/components/branding/site-logo";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

// lucide-react no longer ships brand/logo icons (Facebook, LinkedIn,
// Twitter, YouTube were removed from the package over trademark concerns),
// so the real LinkedIn glyph is hand-coded here; platforms without a
// dedicated icon fall back to the generic external-link arrow below.
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452z" />
    </svg>
  );
}

// Only platforms with a confirmed real URL are rendered — no placeholder
// or guessed social links. Add more here as real URLs are confirmed.
const allSocialLinks = [
  { label: "LinkedIn", href: "https://www.linkedin.com/company/you-mimic/posts/?feedView=all" },
  { label: "Twitter", href: null },
  { label: "YouTube", href: null },
];
const socialLinks = allSocialLinks.filter(
  (social): social is (typeof allSocialLinks)[number] & { href: string } => social.href !== null,
);

// Trimmed to just these three for now, per the checklist ("other pages
// we'll add back in later") — Press, Contact, Business Terms, Media
// Center, and Careers are intentionally left out of this column.
const companyLinks = [
  { label: "Privacy Policy", href: "/privacy-policy.pdf" },
  { label: "AI Ethics", href: "/ai-ethics" },
  { label: "Dataroom", href: "/contact" },
];

const navigationLinks = [
  { label: "Solutions", href: "/solutions" },
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
            <SiteLogo forceVariant="dark" iconVariant="light" />
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
                      {label === "LinkedIn" ? (
                        <LinkedInIcon className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
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
