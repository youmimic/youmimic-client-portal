import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { auth } from "@/auth";
import { ProjectError } from "@/lib/projects/service";

// Shared plumbing for the project API routes: sign-in check, body validation
// and consistent error responses. Ownership is enforced one layer down, in
// lib/projects/service.ts, where every query is scoped to the user id.

export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session.user.id;
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
