import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageAvatars } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { getSettings, setSetting } from "@/lib/settings";
import { cutoutSummary, queueAllMissingCutouts } from "@/lib/backgrounds/cutouts";

// Admin controls for custom backgrounds and cut-out previews:
//   GET   -> the two switches and the cut-out counts
//   PATCH -> { backgroundsForClients?, autoCutouts? }
//   POST  -> { action: "queue-all" } queues every ready look without a cut-out
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!canManageAvatars(session.user.adminRole as AdminRole | null)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { userId: session.user.id } as const;
}

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const [settings, cutouts] = await Promise.all([getSettings(), cutoutSummary()]);
  return NextResponse.json({ settings, cutouts });
}

const patchSchema = z
  .object({ backgroundsForClients: z.boolean().optional(), autoCutouts: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  for (const [key, value] of Object.entries(parsed.data) as ["backgroundsForClients" | "autoCutouts", boolean][]) {
    await setSetting(key, value, guard.userId);
    await writeAuditLog({
      adminUserId: guard.userId,
      action: "set_app_setting",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: key,
      metadata: { key, value },
    });
  }
  return NextResponse.json({ settings: await getSettings() });
}

const postSchema = z.object({ action: z.literal("queue-all") }).strict();

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const queued = await queueAllMissingCutouts();
  await writeAuditLog({
    adminUserId: guard.userId,
    action: "queue_all_cutouts",
    entityType: ENTITY_TYPES.AVATAR,
    entityId: "cutouts",
    metadata: { queued },
  });
  return NextResponse.json({ queued, cutouts: await cutoutSummary() });
}
