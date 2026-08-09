import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { userHasActiveSubscription } from "@/lib/subscription";
import { generateVideoSchema } from "@/lib/validations/video";
import { generateAvatarVideo } from "@/lib/heygen/generate-video";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ avatarId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const result = await generateAvatarVideo(session.user.id, avatarId, parsed.data.script, parsed.data.avatarLookId);
  if (!result.ok) {
    const status = result.code === "HEYGEN_ERROR" ? 502 : 422;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ generatedVideoId: result.generatedVideoId }, { status: 201 });
}
