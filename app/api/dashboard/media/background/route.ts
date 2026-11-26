import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { BackgroundMediaError, registerBackgroundMedia } from "@/lib/backgrounds/media";

const bodySchema = z.object({ url: z.string().url().max(2000) }).strict();

// Registers a background photo/video the browser just uploaded to Blob (see
// ./upload). The file is checked to be in this user's folder of our store
// and of an allowed type and size; the client then saves the returned id on
// a scene (or sends it with a single video), which re-checks ownership.
export async function POST(req: Request) {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  try {
    return NextResponse.json(await registerBackgroundMedia(guard.session.user.id, parsed.data.url));
  } catch (err) {
    if (err instanceof BackgroundMediaError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("Background registration failed:", err);
    return NextResponse.json({ error: "Couldn't save that file. Please try again." }, { status: 500 });
  }
}
