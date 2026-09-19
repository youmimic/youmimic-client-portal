import { draftMode } from "next/headers";
import { client } from "@/sanity/lib/client";
import { isSanityConfigured } from "@/sanity/env";

// Shared read path for every page that pulls CMS content. Draft mode (only
// ever turned on by the Presentation tool's preview iframe — see
// app/api/draft-mode/enable/route.ts) switches to the "drafts" perspective
// so an editor sees unpublished edits; every real visitor always gets the
// published, live content. Returns null rather than throwing when Sanity
// isn't configured yet or the query returns nothing, so every call site can
// fall back to hardcoded defaults the same way lib/ga4/client.ts degrades
// on a missing credential.
export async function sanityFetch<QueryResponse>(
  query: string,
  params: Record<string, unknown> = {},
): Promise<QueryResponse | null> {
  if (!isSanityConfigured) return null;

  const { isEnabled } = await draftMode();

  try {
    const result = await client.fetch<QueryResponse>(query, params, {
      perspective: isEnabled ? "drafts" : "published",
      stega: isEnabled,
    });
    return result ?? null;
  } catch {
    // A misconfigured token/project during setup shouldn't take the whole
    // page down — same "degrade to defaults" convention as the rest of
    // this app's optional external integrations.
    return null;
  }
}
