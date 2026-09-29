import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { userHasActiveSubscription } from "@/lib/subscription";
import { generateVideoSchema } from "@/lib/validations/video";
import { generateAvatarVideo } from "@/lib/heygen/generate-video";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ avatarId: string }> },
) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  // Fresh DB entitlement check — JWT state may be stale after Stripe events.
  const hasActiveSub = await userHasActiveSubscription(session.user.id);
  if (!hasActiveSub) {
    return NextResponse.json(
      { error: "An active subscription is required to use Avatar Studio" },
      { status: 403 },
    );
  }

  const { avatarId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = generateVideoSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const result = await generateAvatarVideo(
    session.user.id,
    avatarId,
    parsed.data.script,
    parsed.data.avatarLookId,
    parsed.data.engine,
    {
      title: parsed.data.title,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
      voiceId: parsed.data.voiceId,
      voiceName: parsed.data.voiceName,
    },
  );
  if (!result.ok) {
    const status =
      result.code === "HEYGEN_ERROR" ? 502 : result.code === "OVER_LIMIT" ? 402 : 422;
    if (result.code === "OVER_LIMIT") {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          creditsUsedMilli: result.creditsUsedMilli,
          creditsLimitMilli: result.creditsLimitMilli,
          periodEnd: result.periodEnd,
        },
        { status },
      );
    }
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ generatedVideoId: result.generatedVideoId }, { status: 201 });
}
