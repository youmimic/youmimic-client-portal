import type { Metadata } from "next";

export const SITE_NAME = "YouMimic";

// Set explicitly on every page (not via Next's opengraph-image file
// convention): a page that defines its own openGraph replaces the site
// default wholesale, and the file-based image was silently dropped, which
// left link previews with no picture.
export const SHARE_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "YouMimic: AI video avatars for your business",
};

// Same env-var convention as app/sitemap.ts and app/robots.ts.
export function siteUrl(): string {
  return process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

// Every public page builds its metadata through this, so the title, the
// share preview and the canonical link always agree with each other. A page
// that sets its own openGraph would otherwise replace the site default
// wholesale, leaving link previews with the wrong title.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_AU",
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}

// For pages that should stay out of search results (sign-in pages, checkout
// steps, placeholder pages). Links are still followed.
export const noIndex: Metadata["robots"] = { index: false, follow: true };

// Facts below come from what the site already shows publicly (footer, contact
// page). Nothing is invented here.
export function organizationJsonLd() {
  const base = siteUrl();
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: "You Mimic Pty Ltd",
    url: base,
    // Green icon + wordmark on a transparent background, made to sit on the
    // white backgrounds Google shows logos on.
    logo: `${base}/youmimic-logo-lockup.png`,
    description:
      "YouMimic builds photorealistic AI avatars and digital twins that deliver your message in 175+ languages.",
    taxID: "39 695 563 627",
    sameAs: ["https://www.linkedin.com/company/you-mimic/"],
    location: [
      {
        "@type": "Place",
        name: "YouMimic Hobart",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Level 5, 24 Davey Street",
          addressLocality: "Hobart",
          addressRegion: "TAS",
          postalCode: "7008",
          addressCountry: "AU",
        },
      },
      {
        "@type": "Place",
        name: "YouMimic Brisbane",
        address: {
          "@type": "PostalAddress",
          streetAddress: "79 McLachlan Street",
          addressLocality: "Fortitude Valley",
          addressRegion: "QLD",
          postalCode: "4006",
          addressCountry: "AU",
        },
      },
    ],
    ...(salesEmail
      ? {
          contactPoint: [
            {
              "@type": "ContactPoint",
              contactType: "sales",
              email: salesEmail,
              areaServed: "AU",
            },
          ],
        }
      : {}),
  };
}
