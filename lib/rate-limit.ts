import prisma from "@/lib/prisma";

interface RateLimitConfig {
  // Should already be namespaced by caller, e.g. `login:ip:${ip}` or
  // `register:ip:${ip}` — see callers for the convention.
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// Fixed-window counter backed by Postgres (see RateLimitBucket in
// schema.prisma for why: no Redis/KV infra exists in this app, and this
// needs to work correctly across Vercel's multiple serverless instances,
// which an in-memory counter would not).
//
// Fixed windows have a known edge case (a burst straddling the window
// boundary can let through up to 2x the limit) but that's an acceptable
// tradeoff here — the goal is blunting scripted brute-force/spam, not
// precise adversarial rate accounting.
export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitConfig): Promise<RateLimitResult> {
  const now = new Date();

  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });

  const windowExpired =
    !bucket || now.getTime() - bucket.windowStart.getTime() >= windowMs;

  if (windowExpired) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowResetAt = bucket.windowStart.getTime() + windowMs;

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowResetAt - now.getTime()) / 1000),
    };
  }

  await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { allowed: true, retryAfterSeconds: 0 };
}

// Vercel (and most reverse proxies) set x-forwarded-for to a comma-separated
// list of "client, proxy1, proxy2" — the first entry is the original client.
// Falls back to a constant key when absent (local dev without a proxy in
// front) rather than skipping the limit entirely.
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "unknown";
}
