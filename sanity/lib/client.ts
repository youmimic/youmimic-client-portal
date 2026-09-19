import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "@/sanity/env";

// useCdn: false — this is a low-traffic marketing site reading a handful of
// singleton documents, not a high-QPS storefront, so always hitting the
// live API (fresher content, no CDN cache lag after an editor publishes) is
// worth more here than the CDN's edge-caching benefit.
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  // Only used server-side when draft mode is on (see sanity/lib/fetch.ts) —
  // never exposed to the browser. Lets a signed-in editor previewing a
  // draft see unpublished changes; anonymous visitors never get this token.
  token: process.env.SANITY_API_READ_TOKEN,
});
