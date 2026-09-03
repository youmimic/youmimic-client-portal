import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindFirst = vi.fn();
const ledgerGroupBy = vi.fn();
const ledgerCreate = vi.fn();
const ledgerUpdate = vi.fn();
const ledgerUpdateMany = vi.fn();
const transaction = vi.fn();

// lib/prisma.ts throws at import time if DATABASE_URL is unset, so it must
// never actually be imported here — mock it before any of lib/usage/ledger.ts's
// dependency chain (lib/subscription.ts, lib/prisma.ts itself) pulls it in.
// Vitest hoists vi.mock calls above all imports in this file.
vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: { findFirst: (...args: unknown[]) => subscriptionFindFirst(...args) },
    usageLedgerEntry: {
      groupBy: (...args: unknown[]) => ledgerGroupBy(...args),
      create: (...args: unknown[]) => ledgerCreate(...args),
      update: (...args: unknown[]) => ledgerUpdate(...args),
      updateMany: (...args: unknown[]) => ledgerUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import {
  resolveBillingPeriod,
  reserveCredits,
  reserveCreditsForGeneration,
  releaseReservation,
  releaseReservationForVideo,
  reconcileCredits,
} from "@/lib/usage/ledger";
import { PlanType, UsageLedgerStatus } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";

// The mocked module doubles as a stand-in Prisma.TransactionClient for
// resolveBillingPeriod/reserveCredits, which only ever call methods through
// their `tx` parameter — never the module-level `prisma` singleton.
const fakeTx = {
  subscription: { findFirst: (...args: unknown[]) => subscriptionFindFirst(...args) },
  usageLedgerEntry: {
    groupBy: (...args: unknown[]) => ledgerGroupBy(...args),
    create: (...args: unknown[]) => ledgerCreate(...args),
  },
} as unknown as Prisma.TransactionClient;

beforeEach(() => {
  subscriptionFindFirst.mockReset();
  ledgerGroupBy.mockReset();
  ledgerCreate.mockReset();
  ledgerUpdate.mockReset();
  ledgerUpdateMany.mockReset();
  transaction.mockReset();
});

describe("resolveBillingPeriod", () => {
  it("uses the subscription's real currentPeriodStart/End when present", async () => {
    const periodStart = new Date("2026-08-01");
    const periodEnd = new Date("2026-09-01");
    subscriptionFindFirst.mockResolvedValueOnce({
      id: "sub_1",
      planType: PlanType.CREATOR,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    const result = await resolveBillingPeriod(fakeTx, "user_1");

    expect(result).toEqual({
      subscriptionId: "sub_1",
      planType: PlanType.CREATOR,
      periodStart,
      periodEnd,
    });
  });

  it("falls back to a calendar-month window when no subscription applies", async () => {
    subscriptionFindFirst.mockResolvedValue(null); // both the personal and enterprise-owner lookups

    const result = await resolveBillingPeriod(fakeTx, "user_2");

    expect(result.subscriptionId).toBeNull();
    expect(result.planType).toBe(PlanType.FREE);
    expect(result.periodStart.getDate()).toBe(1);
    expect(result.periodEnd.getTime()).toBeGreaterThan(result.periodStart.getTime());
  });

  it("falls back to a calendar-month window when the subscription has no period fields", async () => {
    subscriptionFindFirst.mockResolvedValueOnce({
      id: "sub_2",
      planType: PlanType.ENTERPRISE,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const result = await resolveBillingPeriod(fakeTx, "user_3");

    expect(result.subscriptionId).toBe("sub_2");
    expect(result.planType).toBe(PlanType.ENTERPRISE);
    expect(result.periodStart.getDate()).toBe(1);
  });
});

describe("reserveCredits", () => {
  const periodStart = new Date("2026-08-01");
  const periodEnd = new Date("2026-09-01");

  beforeEach(() => {
    subscriptionFindFirst.mockResolvedValueOnce({
      id: "sub_1",
      planType: PlanType.CREATOR,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  });

  it("reserves credits and creates a RESERVED row when under the limit", async () => {
    ledgerGroupBy.mockResolvedValue([]); // nothing used yet this period
    ledgerCreate.mockResolvedValue({ id: "ledger_1" });

    const result = await reserveCredits(fakeTx, {
      userId: "user_1",
      engine: "AVATAR_III" as never,
      script: "hello world",
    });

    expect(result).toEqual({ ok: true, ledgerEntryId: "ledger_1" });
    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          subscriptionId: "sub_1",
          status: UsageLedgerStatus.RESERVED,
          periodStart,
          periodEnd,
        }),
      }),
    );
  });

  it("sums RESERVED (reserved) and RECONCILED (charged) credits, excluding RELEASED entirely", async () => {
    ledgerGroupBy.mockResolvedValue([
      { status: UsageLedgerStatus.RESERVED, _sum: { creditsReservedMilli: 100, creditsChargedMilli: null } },
      { status: UsageLedgerStatus.RECONCILED, _sum: { creditsReservedMilli: null, creditsChargedMilli: 200 } },
    ]);
    ledgerCreate.mockResolvedValue({ id: "ledger_2" });

    await reserveCredits(fakeTx, { userId: "user_1", engine: "AVATAR_III" as never, script: "one two three" });

    // 100 (RESERVED) + 200 (RECONCILED) = 300 already used, well under the
    // very-high placeholder limit, so this should still succeed.
    expect(ledgerCreate).toHaveBeenCalled();
  });

  it("returns OVER_LIMIT and creates no row when the estimate would exceed the limit", async () => {
    // Override the outer beforeEach's CREATOR mock — no subscription
    // resolves to a FREE fallback, which has a 0 credit limit (see
    // lib/heygen/credits.ts), so any non-zero estimate is over.
    subscriptionFindFirst.mockReset();
    subscriptionFindFirst.mockResolvedValue(null);
    ledgerGroupBy.mockResolvedValue([]);

    const result = await reserveCredits(fakeTx, {
      userId: "user_2",
      engine: "AVATAR_III" as never,
      script: "any script at all",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OVER_LIMIT");
    }
    expect(ledgerCreate).not.toHaveBeenCalled();
  });
});

describe("reserveCreditsForGeneration", () => {
  it("opens a transaction and delegates to reserveCredits", async () => {
    transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(fakeTx));
    subscriptionFindFirst.mockResolvedValueOnce({
      id: "sub_1",
      planType: PlanType.CREATOR,
      currentPeriodStart: new Date("2026-08-01"),
      currentPeriodEnd: new Date("2026-09-01"),
    });
    ledgerGroupBy.mockResolvedValue([]);
    ledgerCreate.mockResolvedValue({ id: "ledger_3" });

    const result = await reserveCreditsForGeneration({
      userId: "user_1",
      engine: "AVATAR_III" as never,
      script: "hello",
    });

    expect(transaction).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, ledgerEntryId: "ledger_3" });
  });
});

describe("releaseReservation", () => {
  it("conditionally flips a RESERVED row to RELEASED", async () => {
    await releaseReservation("ledger_1");
    expect(ledgerUpdateMany).toHaveBeenCalledWith({
      where: { id: "ledger_1", status: UsageLedgerStatus.RESERVED },
      data: { status: UsageLedgerStatus.RELEASED, releasedAt: expect.any(Date) },
    });
  });
});

describe("releaseReservationForVideo", () => {
  it("conditionally flips a RESERVED row (looked up by videoId) to RELEASED", async () => {
    await releaseReservationForVideo("video_1");
    expect(ledgerUpdateMany).toHaveBeenCalledWith({
      where: { videoId: "video_1", status: UsageLedgerStatus.RESERVED },
      data: { status: UsageLedgerStatus.RELEASED, releasedAt: expect.any(Date) },
    });
  });
});

describe("reconcileCredits", () => {
  it("charges the real duration and flips a RESERVED row to RECONCILED", async () => {
    await reconcileCredits({ videoId: "video_1", engine: "AVATAR_III" as never, actualDurationSeconds: 10 });
    expect(ledgerUpdateMany).toHaveBeenCalledWith({
      where: { videoId: "video_1", status: UsageLedgerStatus.RESERVED },
      data: {
        status: UsageLedgerStatus.RECONCILED,
        actualDurationSeconds: 10,
        creditsChargedMilli: 167,
        reconciledAt: expect.any(Date),
      },
    });
  });
});
