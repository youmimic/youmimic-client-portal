import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const findUnique = vi.fn();
const upsert = vi.fn();
const update = vi.fn();

// lib/prisma.ts throws at import time if DATABASE_URL is unset, so it must
// never actually be imported here — mock it out before checkRateLimit pulls
// it in. Vitest hoists vi.mock calls above all imports in the file
// (including the static import above), so this still runs first.
vi.mock("@/lib/prisma", () => ({
  default: {
    rateLimitBucket: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  update.mockReset();
});

describe("checkRateLimit", () => {
  it("allows a brand-new key and creates its bucket", async () => {
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    const result = await checkRateLimit({
      key: "test:new",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: "test:new" },
      create: { key: "test:new", count: 1, windowStart: expect.any(Date) },
      update: { count: 1, windowStart: expect.any(Date) },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a request under the limit and increments the count", async () => {
    findUnique.mockResolvedValue({
      key: "test:under",
      count: 2,
      windowStart: new Date(),
    });
    update.mockResolvedValue({});

    const result = await checkRateLimit({
      key: "test:under",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { key: "test:under" },
      data: { count: { increment: 1 } },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("denies a request at the limit without writing to the bucket", async () => {
    const windowStart = new Date();
    findUnique.mockResolvedValue({
      key: "test:at-limit",
      count: 5,
      windowStart,
    });

    const result = await checkRateLimit({
      key: "test:at-limit",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("resets a bucket whose window has already expired, even if count was at/over the limit", async () => {
    const longExpired = new Date(Date.now() - 120_000); // 2 min ago, window is 60s
    findUnique.mockResolvedValue({
      key: "test:expired",
      count: 999,
      windowStart: longExpired,
    });
    upsert.mockResolvedValue({});

    const result = await checkRateLimit({
      key: "test:expired",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: "test:expired" },
      create: { key: "test:expired", count: 1, windowStart: expect.any(Date) },
      update: { count: 1, windowStart: expect.any(Date) },
    });
  });
});

describe("getClientIp", () => {
  it("returns the first IP from a comma-separated x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1, 10.0.0.2" },
    });
    expect(getClientIp(req)).toBe("203.0.113.42");
  });

  it("trims whitespace around the first IP", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  203.0.113.42  , 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.42");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});
