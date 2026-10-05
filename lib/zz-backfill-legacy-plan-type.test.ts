import { it, expect } from "vitest";

// One-time production data fix, run on 2026-10-05 — NOT a throwaway script
// (unlike this session's other zz-tmp-*.test.ts diagnostic files, which are
// deleted after use). Kept as a permanent, reviewable record of exactly what
// changed and why, and safe to re-run: the where clause only ever matches
// rows still mistagged ENTERPRISE, so running it again when none remain is
// a no-op.
//
// Context: every Subscription row created through the manual admin "Phase 1"
// billing tools (platform-fee, storage-subscription routes) used to hardcode
// planType: "ENTERPRISE" — indistinguishable from a real self-serve
// Enterprise-tier plan purchase (billingComponent STANDARD). Both routes now
// write "LEGACY" instead (see PlanType's schema comment); this backfills
// every row created before that fix. Confirmed live beforehand: exactly 11
// rows match, all billingComponent PLATFORM_FEE, all $0, none with a real
// stripeSubscriptionId — and the 18 real billingComponent=STANDARD rows with
// planType=ENTERPRISE are a disjoint set, untouched by this filter.
//
// Must keep the .test.ts suffix to stay runnable at all (vitest's CLI only
// executes files matching its configured `include` glob, even by explicit
// path) — but must NOT run as part of the normal suite, since this is a
// real write against production data, not a repeatable unit test. Guarded
// by RUN_LEGACY_PLAN_BACKFILL so a bare `vitest run`/`npm test` always
// skips it; re-run deliberately via:
//   RUN_LEGACY_PLAN_BACKFILL=1 node --env-file=.env node_modules/vitest/vitest.mjs run lib/zz-backfill-legacy-plan-type.test.ts
//
// lib/prisma.ts throws at import time if DATABASE_URL is unset, so the
// import itself must stay inside the guarded test body (dynamic import) —
// skipIf alone only skips the test body, not a top-level import, which
// would otherwise still crash module loading during every normal test run.
it.skipIf(!process.env.RUN_LEGACY_PLAN_BACKFILL)("backfills every Phase-1 (manual) subscription row from ENTERPRISE to LEGACY", async () => {
  const { default: prisma } = await import("@/lib/prisma");

  const before = await prisma.subscription.count({
    where: { planType: "ENTERPRISE", billingComponent: { in: ["PLATFORM_FEE", "AVATAR_STORAGE"] } },
  });
  console.log("ROWS_TO_BACKFILL", before);

  const result = await prisma.subscription.updateMany({
    where: { planType: "ENTERPRISE", billingComponent: { in: ["PLATFORM_FEE", "AVATAR_STORAGE"] } },
    data: { planType: "LEGACY" },
  });
  console.log("BACKFILLED", result.count);

  const remaining = await prisma.subscription.count({
    where: { planType: "ENTERPRISE", billingComponent: { in: ["PLATFORM_FEE", "AVATAR_STORAGE"] } },
  });
  const untouchedStandardRows = await prisma.subscription.count({
    where: { planType: "ENTERPRISE", billingComponent: "STANDARD" },
  });
  console.log("REMAINING_MISTAGGED", remaining, "REAL_ENTERPRISE_STANDARD_ROWS", untouchedStandardRows);

  expect(remaining).toBe(0);
});
