import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

// Paired with enable/route.ts — no secret validation needed here since
// turning draft mode *off* can't expose anything; it just stops applying
// to whoever's session cookie called this.
export async function GET() {
  const draftModeStore = await draftMode();
  draftModeStore.disable();
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
