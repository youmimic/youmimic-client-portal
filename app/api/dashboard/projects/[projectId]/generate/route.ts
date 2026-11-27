import { NextResponse } from "next/server";
import { userHasActiveSubscription } from "@/lib/subscription";
import { generateProjectSchema } from "@/lib/projects/schemas";
import { generateProject } from "@/lib/projects/generate";
import { errorResponse, readBody, requireUserId } from "@/lib/projects/http";

// Generating can include making an adjusted copy of a background video with
// ffmpeg (lib/backgrounds/renditions.ts), roughly 20-40 s for a short clip on
// a Vercel function, once per setting (cached after). Fluid compute on the
// Pro plan allows up to 800 s; 300 s leaves headroom for the provider call.
export const maxDuration = 300;

// Renders the whole project as one video. See lib/projects/generate.ts for the
// double-submit guard and the credit reservation.
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  // Fresh DB entitlement check: JWT state may be stale after Stripe events.
  if (!(await userHasActiveSubscription(userId))) {
    return NextResponse.json({ error: "An active subscription is required to generate videos." }, { status: 403 });
  }

  const body = await readBody(req, generateProjectSchema);
  if ("response" in body) return body.response;

  try {
    const result = await generateProject(userId, projectId, body.data.expectedVersion);
    if (result.ok) return NextResponse.json({ generatedVideoId: result.generatedVideoId }, { status: 201 });

    const status = result.code === "HEYGEN_ERROR" ? 502 : result.code === "OVER_LIMIT" ? 402 : 422;
    return NextResponse.json(result, { status });
  } catch (err) {
    return errorResponse(err);
  }
}
