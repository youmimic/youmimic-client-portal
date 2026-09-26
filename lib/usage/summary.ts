import prisma from "@/lib/prisma";
import { UsageLedgerStatus } from "@/app/generated/prisma/enums";
import type { VideoEngine } from "@/app/generated/prisma/enums";
import { resolveBillingPeriod } from "@/lib/usage/ledger";

export type UsageSummary = {
  periodStart: Date;
  periodEnd: Date;
  planType: string;
  // Millicredits are the ledger's unit; the page shows credits.
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
};

// What the Usage page shows: this billing period's activity for one user. All
// figures are estimates. Cost is derived from finished video length, and
// credits come from the usage ledger (reserved amounts until a video
// finishes, then the final charge).
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const period = await prisma.$transaction((tx) => resolveBillingPeriod(tx, userId));
  const { periodStart, periodEnd } = period;

  const [ledger, videos] = await Promise.all([
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
  for (const g of ledger) {
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

  return {
    periodStart,
    periodEnd,
    planType: period.planType,
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
  };
}
