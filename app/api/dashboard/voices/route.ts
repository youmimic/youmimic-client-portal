import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { HeyGenApiError, listHeyGenVoices } from "@/lib/heygen";

// Lists provider voices for the voice picker in the video workspace.
// Read-only, so it only needs a signed-in user. Voices rarely change, so the
// browser may reuse a response for a few minutes.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language")?.slice(0, 40) || undefined;
  const gender = searchParams.get("gender")?.slice(0, 20) || undefined;
  const token = searchParams.get("token")?.slice(0, 500) || undefined;

  try {
    const result = await listHeyGenVoices({ language, gender, token, limit: 50 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof HeyGenApiError ? err.message : "Could not load voices.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
