import { BetaAnalyticsDataClient } from "@google-analytics/data";

// Deliberately its own service account, built lazily from its own env vars
// (not shared with any other Google integration in this app). Built inside
// each call, not at module load, so a missing/rotated credential degrades to
// the same "unavailable" result as any other fetch failure rather than
// crashing at import time — same convention as lib/stripe/mrr.ts.
function ga4Client(): BetaAnalyticsDataClient | null {
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      // Env vars can't hold real newlines, so the key is stored with
      // literal "\n" escapes and unescaped here.
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  });
}

// GA4's "date" dimension comes back as "YYYYMMDD" with no separators.
function formatGa4Date(raw: string | null | undefined): string {
  if (!raw || raw.length !== 8) return raw ?? "";
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export type AnalyticsOverview = {
  totals: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgEngagementSeconds: number;
  };
  dailyActiveUsers: { date: string; activeUsers: number }[];
  topPages: { path: string; views: number }[];
  channels: { channel: string; sessions: number }[];
};

export type AnalyticsResult =
  | { ok: true; data: AnalyticsOverview }
  | { ok: false; error: string };

// Pulls a small overview (last 28/30 days) from the GA4 Data API for the
// admin analytics page. Never throws — a missing credential or a failing
// Google API call degrades to a visible "unavailable" state on the caller's
// side rather than breaking the whole page, same convention as fetchMrr().
export async function fetchAnalyticsOverview(): Promise<AnalyticsResult> {
  const client = ga4Client();
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!client || !propertyId) {
    return {
      ok: false,
      error: "GA4 is not configured (GA4_PROPERTY_ID / GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY)",
    };
  }

  const property = `properties/${propertyId}`;

  try {
    const [totalsResponse, dailyResponse, pagesResponse, channelsResponse] = await Promise.all([
      client.runReport({
        property,
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
        ],
      }),
      client.runReport({
        property,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      client.runReport({
        property,
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
      client.runReport({
        property,
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      }),
    ]);

    const totalsRow = totalsResponse[0].rows?.[0];
    const totals = {
      activeUsers: Number(totalsRow?.metricValues?.[0]?.value ?? 0),
      sessions: Number(totalsRow?.metricValues?.[1]?.value ?? 0),
      pageViews: Number(totalsRow?.metricValues?.[2]?.value ?? 0),
      avgEngagementSeconds: Number(totalsRow?.metricValues?.[3]?.value ?? 0),
    };

    const dailyActiveUsers = (dailyResponse[0].rows ?? []).map((row) => ({
      date: formatGa4Date(row.dimensionValues?.[0]?.value),
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const topPages = (pagesResponse[0].rows ?? []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || "(unknown)",
      views: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const channels = (channelsResponse[0].rows ?? []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "(unknown)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    return { ok: true, data: { totals, dailyActiveUsers, topPages, channels } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
