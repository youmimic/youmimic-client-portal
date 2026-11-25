import { NextResponse } from "next/server";
import { requireUserId, readBody } from "@/lib/projects/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateScriptSchema } from "@/lib/validations/ai";
import { generateVideoScript } from "@/lib/ai/generate-script";

// The AI call itself can take up to 45s (see REQUEST_TIMEOUT_MS).
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  // Same shape as the document-import rate limit (10/hour) — a free-tier
  // upstream model is the kind of thing worth being conservative about
  // bursting against, not just a cost concern this time.
  const rateLimit = await checkRateLimit({
    key: `generate-script:user:${userId}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many script generations. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await readBody(req, generateScriptSchema);
  if ("response" in body) return body.response;

  const result = await generateVideoScript(body.data.topic);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ script: result.script });
}
