import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Only pages that are real, public and worth ranking. Placeholder pages
// (careers, dataroom, media center) and sign-in/checkout steps are left out
// on purpose. No lastModified: a fake "changed just now" date on every
// entry teaches search engines to ignore the field, so it's better left off.
const routes = [
  "",
  "/pricing",
  "/solutions",
  "/solutions/small-business",
  "/contact",
  "/ai-ethics",
  "/press",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  return routes.map((route) => ({ url: `${baseUrl}${route}` }));
}
