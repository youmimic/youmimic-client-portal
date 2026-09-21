import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

const baseUrl = siteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/api",
        // Token-bearing URLs: no indexable content, and crawling risks
        // leaking a valid link if one is ever exposed elsewhere.
        "/reset-password",
        "/invite",
        "/verify-email",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
