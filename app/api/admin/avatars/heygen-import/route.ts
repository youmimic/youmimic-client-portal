import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { heygenImportSchema } from "@/lib/validations/admin";
import { planAvatarImport, executeAvatarImport } from "@/lib/heygen/import-avatars";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageAvatars(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = heygenImportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    if (parsed.data.dryRun) {
      const plan = await planAvatarImport();
      return NextResponse.json({ dryRun: true, plan });
    }

    const result = await executeAvatarImport(session.user.id);
    return NextResponse.json({ dryRun: false, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `HeyGen import failed: ${message}` }, { status: 502 });
  }
}
