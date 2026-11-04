import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "@/lib/auth/api-guards";
import prisma from "@/lib/prisma";

const bodySchema = z.object({ enabled: z.boolean() });

// Admin-only preference — client mode has no meaning for a non-admin
// account, so this isn't a general-purpose user setting.
export async function PATCH(req: Request) {
  const guard = await requireDashboardSession();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!session.user.adminRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { clientModeEnabled: parsed.data.enabled },
  });

  return NextResponse.json({ success: true, enabled: parsed.data.enabled });
}
