import prisma from "@/lib/prisma";
import { UsageLedgerStatus } from "@/app/generated/prisma/enums";
import type { VideoEngine } from "@/app/generated/prisma/enums";
import { resolveBillingPeriod, resolveBillingPeriodForEnterprise } from "@/lib/usage/ledger";

export type UsageSummary = {
  periodStart: Date;
  periodEnd: Date;
  planType: string;
  // The cap — personal for an individual account, or the enterprise's
  // shared cap (same number for every member) for an enterprise one.
  // Millicredits are the ledger's unit; the page shows credits. Null means
  // no real cap applies (the shared per-plan placeholder is effectively
  // unlimited) — only set when the resolved subscription carries a real
  // creditsLimitMilliOverride (see lib/usage/ledger.ts).
  creditsLimit: number | null;
  // This viewer's own credits used this period. For a personal account this
  // is the whole picture against creditsLimit above. For an enterprise
  // account it's just this person's share of the shared pool — see
  // `enterprise` below for the pool's actual total against that same cap.
  creditsUsed: number;
  videosStarted: number;
  videosCompleted: number;
  completedSeconds: number;
  estimatedCostCents: number;
  byEngine: { engine: VideoEngine; videos: number; seconds: number; costCents: number; credits: number }[];
  recent: {
    id: string;
    title: string | null;
    script: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    engine: VideoEngine;
    createdAt: Date;
    durationSeconds: number | null;
    estimatedCostCents: number | null;
    projectId: string | null;
  }[];
  // Set only for an enterprise account (owner or member — see
  // lib/subscription.ts) — the shared pool every member draws against
  // (against the same creditsLimit above), same number regardless of who's
  // viewing. Null for a personal account, which has no separate pool to
  // report beyond creditsUsed/creditsLimit above.
  enterprise: { creditsUsed: number } | null;
};

// What the Usage page shows: this billing period's activity. The headline
// stats (videos made, length, cost, credits used, recent videos) are always
// this viewer's own — someone's personal "Videos made" card showing a
// teammate's videos instead of their own was more confusing than useful,
// and the per-video page is owner-scoped anyway so a teammate's row in
// "recent" couldn't even be opened. The credit *pool* is the one number
// that's genuinely shared on an enterprise account (lib/usage/ledger.ts
// enforces the cap pooled by subscriptionId, not per member), so that's
// reported separately via `enterprise` rather than blended into the
// personal figures above it.
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const period = await prisma.$transaction((tx) => resolveBillingPeriod(tx, userId));
  const { periodStart, periodEnd, subscriptionId, enterpriseId, creditsLimitMilliOverride } = period;

  const [personalLedger, enterpriseLedger, videos] = await Promise.all([
    prisma.usageLedgerEntry.groupBy({
      by: ["engine", "status"],
      where: {
        userId,
        periodStart,
        periodEnd,
        status: { in: [UsageLedgerStatus.RESERVED, UsageLedgerStatus.RECONCILED] },
      },
      _sum: { creditsReservedMilli: true, creditsChargedMilli: true },
    }),
    // Only needed for an enterprise account — matches lib/usage/ledger.ts's
    // own enforcement scoping (pooled by subscriptionId, not userId).
    enterpriseId && subscriptionId
      ? prisma.usageLedgerEntry.groupBy({
          by: ["status"],
          where: {
            subscriptionId,
            periodStart,
            periodEnd,
            status: { in: [UsageLedgerStatus.RESERVED, UsageLedgerStatus.RECONCILED] },
          },
          _sum: { creditsReservedMilli: true, creditsChargedMilli: true },
        })
      : null,
    prisma.generatedVideo.findMany({
      where: { userId, createdAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        script: true,
        status: true,
        engine: true,
        createdAt: true,
        durationSeconds: true,
        estimatedCostCents: true,
        projectId: true,
      },
    }),
  ]);

  const creditsByEngine = new Map<VideoEngine, number>();
  let creditsMilli = 0;
  for (const g of personalLedger) {
    const milli = g.status === UsageLedgerStatus.RESERVED ? (g._sum.creditsReservedMilli ?? 0) : (g._sum.creditsChargedMilli ?? 0);
    creditsMilli += milli;
    creditsByEngine.set(g.engine, (creditsByEngine.get(g.engine) ?? 0) + milli);
  }

  const engines = new Map<VideoEngine, { videos: number; seconds: number; costCents: number }>();
  let completedSeconds = 0;
  let costCents = 0;
  let videosCompleted = 0;
  for (const v of videos) {
    if (v.status === "FAILED") continue;
    const row = engines.get(v.engine) ?? { videos: 0, seconds: 0, costCents: 0 };
    row.videos += 1;
    if (v.status === "COMPLETED") {
      videosCompleted += 1;
      row.seconds += v.durationSeconds ?? 0;
      row.costCents += v.estimatedCostCents ?? 0;
      completedSeconds += v.durationSeconds ?? 0;
      costCents += v.estimatedCostCents ?? 0;
    }
    engines.set(v.engine, row);
  }

  let enterpriseSummary: UsageSummary["enterprise"] = null;
  if (enterpriseLedger) {
    let enterpriseMilli = 0;
    for (const g of enterpriseLedger) {
      enterpriseMilli += g.status === UsageLedgerStatus.RESERVED ? (g._sum.creditsReservedMilli ?? 0) : (g._sum.creditsChargedMilli ?? 0);
    }
    enterpriseSummary = { creditsUsed: enterpriseMilli / 1000 };
  }

  return {
    periodStart,
    periodEnd,
    planType: period.planType,
    creditsLimit: creditsLimitMilliOverride != null ? creditsLimitMilliOverride / 1000 : null,
    creditsUsed: creditsMilli / 1000,
    videosStarted: videos.filter((v) => v.status !== "FAILED").length,
    videosCompleted,
    completedSeconds,
    estimatedCostCents: costCents,
    byEngine: [...engines.entries()].map(([engine, r]) => ({
      engine,
      ...r,
      credits: (creditsByEngine.get(engine) ?? 0) / 1000,
    })),
    recent: videos.slice(0, 8),
    enterprise: enterpriseSummary,
  };
}

export type EnterpriseCreditUsage = {
  periodStart: Date;
  periodEnd: Date;
  creditsUsed: number;
  creditsLimit: number | null;
};

// For the admin enterprise detail page — same pooled-by-subscriptionId
// figure every member's own Usage page shows them (see getUsageSummary's
// `enterprise` field above and lib/usage/ledger.ts's enforcement), just
// resolved directly against the enterprise rather than through a member who
// happens to be logged in. Null when the enterprise has no applicable
// subscription at all (e.g. never billed).
export async function getEnterpriseCreditUsage(enterpriseId: string): Promise<EnterpriseCreditUsage | null> {
  const period = await resolveBillingPeriodForEnterprise(enterpriseId);
  if (!period.subscriptionId) return null;

  const grouped = await prisma.usageLedgerEntry.groupBy({
    by: ["status"],
    where: {
      subscriptionId: period.subscriptionId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      status: { in: [UsageLedgerStatus.RESERVED, UsageLedgerStatus.RECONCILED] },
    },
    _sum: { creditsReservedMilli: true, creditsChargedMilli: true },
  });

  let creditsMilli = 0;
  for (const g of grouped) {
    creditsMilli += g.status === UsageLedgerStatus.RESERVED ? (g._sum.creditsReservedMilli ?? 0) : (g._sum.creditsChargedMilli ?? 0);
  }

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    creditsUsed: creditsMilli / 1000,
    creditsLimit: period.creditsLimitMilliOverride != null ? period.creditsLimitMilliOverride / 1000 : null,
  };
}
