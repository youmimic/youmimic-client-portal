// Read lazily (as plain exports, not a function) since these are all
// NEXT_PUBLIC_* — inlined at build time by Next.js either way. Every
// consumer treats a missing projectId as "CMS not configured yet" and falls
// back to hardcoded page content, the same degrade-gracefully convention
// used by lib/ga4/client.ts and lib/stripe/mrr.ts for other optional
// external integrations.
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
// Bump this on any breaking schema/query change — see Sanity's own
// versioning guidance. Pinned to a date, not "latest", so a future Sanity
// API change can't silently alter query results.
export const apiVersion = "2025-01-01";

export const isSanityConfigured = Boolean(projectId);
