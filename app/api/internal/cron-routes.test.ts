import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Vercel invokes cron paths with GET plus "Authorization: Bearer <CRON_SECRET>"
// (vercel.com/docs/cron-jobs). Both routes used to export only POST, so every
// scheduled run got 405 and silently never ran. All work is mocked here.
const work = vi.hoisted(() => ({
  refreshExpiringVideoUrls: vi.fn(async () => ({ refreshed: 0 })),
  sweepStuckGenerations: vi.fn(async () => ({ reconciled: 0 })),
  removeSlideImagesAfterRender: vi.fn(async () => ({ usersChecked: 0, imagesDeleted: 0 })),
  removeUnusedBackgroundMedia: vi.fn(async () => ({ deleted: 0 })),
  processCheckoutDraftLifecycle: vi.fn(async () => ({ sent2d: 0 })),
  processBookingReminders: vi.fn(async () => ({ sent: 0 })),
  processCutoutQueue: vi.fn(async () => ({ started: 0 })),
}));
vi.mock("@/lib/heygen/generate-video", () => ({
  refreshExpiringVideoUrls: work.refreshExpiringVideoUrls,
  sweepStuckGenerations: work.sweepStuckGenerations,
}));
vi.mock("@/lib/slides/images", () => ({ removeSlideImagesAfterRender: work.removeSlideImagesAfterRender }));
vi.mock("@/lib/backgrounds/media", () => ({ removeUnusedBackgroundMedia: work.removeUnusedBackgroundMedia }));
vi.mock("@/lib/checkout/process-draft-lifecycle", () => ({ processCheckoutDraftLifecycle: work.processCheckoutDraftLifecycle }));
vi.mock("@/lib/backgrounds/cutouts", () => ({ processCutoutQueue: work.processCutoutQueue }));
vi.mock("@/lib/bookings/process-reminders", () => ({ processBookingReminders: work.processBookingReminders }));
vi.mock("@/lib/stripe/avatar-billing", () => ({ provisionAvatarStorageSubscription: vi.fn(), retryLegacyAvatarSubscription: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { subscription: { findMany: vi.fn(async () => []) }, enterprise: { findUnique: vi.fn() } } }));

import * as video from "@/app/api/internal/videos/refresh-expired-urls/route";
import * as billing from "@/app/api/internal/billing/retry-failed-provisioning/route";
import * as cutouts from "@/app/api/internal/looks/cutouts/route";

const routes = { video, billing, cutouts };
const call = (auth?: string) =>
  new Request("http://localhost/cron", { headers: auth ? { authorization: auth } : {} });

describe("cron routes", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    for (const fn of Object.values(work)) fn.mockClear();
  });

  it("every vercel.json cron path points at a route that exports GET", () => {
    const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[];
    expect(crons.map((c) => c.path).sort()).toEqual([
      "/api/internal/billing/retry-failed-provisioning",
      "/api/internal/looks/cutouts",
      "/api/internal/videos/refresh-expired-urls",
    ]);
    expect(typeof video.GET).toBe("function");
    expect(typeof billing.GET).toBe("function");
    expect(typeof cutouts.GET).toBe("function");
  });

  for (const [name, route] of Object.entries(routes)) {
    it(`${name}: GET and POST run with the secret`, async () => {
      expect((await route.GET(call("Bearer s3cret"))).status).toBe(200);
      expect((await route.POST(call("Bearer s3cret"))).status).toBe(200);
    });

    it(`${name}: refuses a missing or wrong secret, doing no work`, async () => {
      expect((await route.GET(call())).status).toBe(401);
      expect((await route.GET(call("Bearer nope"))).status).toBe(401);
      vi.stubEnv("CRON_SECRET", "");
      expect((await route.GET(call("Bearer "))).status).toBe(401);
      for (const fn of Object.values(work)) expect(fn).not.toHaveBeenCalled();
    });
  }

  it("video: a slide clean-up failure doesn't hide the other results", async () => {
    work.removeSlideImagesAfterRender.mockRejectedValueOnce(new Error("blob down"));
    const res = await video.GET(call("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ urlRefresh: { refreshed: 0 }, slideCleanup: { error: "failed" } });
  });
});
