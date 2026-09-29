import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import { ProjectError } from "@/lib/projects/service";

// Shared plumbing for the project API routes: sign-in check, body validation
// and consistent error responses. Ownership is enforced one layer down, in
// lib/projects/service.ts, where every query is scoped to the user id.

// Every project route funnels through here, so this one call site covers
// all of them for the requireAcceptedLegal/requireEmailVerified gates that
// otherwise only ran at the page level (/dashboard/videos/projects/[id]) —
// see lib/auth/api-guards.ts.
export async function requireUserId(): Promise<string | NextResponse> {
  const guard = await requireDashboardSession({ requireEmailVerified: true });
  if (!guard.ok) return guard.response;
  return guard.session.user.id;
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "Validation failed", code: "VALIDATION", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 422 },
      ),
    };
  }
  return { data: parsed.data };
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ProjectError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error("Project API error", err);
  return NextResponse.json(
    { error: "Something went wrong on our side. Please try again.", code: "SERVER_ERROR" },
    { status: 500 },
  );
}
