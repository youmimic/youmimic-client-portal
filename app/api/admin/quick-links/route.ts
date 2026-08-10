import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canManageQuickLinks } from "@/lib/admin/rbac";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";
import { createQuickLinkSchema } from "@/lib/validations/admin";

export async function GET() {
  const session = await auth();
  if (!session?.user?.adminRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quickLinks = await prisma.quickLink.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ quickLinks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorRole = session.user.adminRole as AdminRole | null;
  if (!canManageQuickLinks(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = createQuickLinkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // New links go to the end of the list — one query for the current max
  // rather than a full table scan, list is always small.
  const last = await prisma.quickLink.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const nextOrder = (last?.order ?? -1) + 1;

  const quickLink = await prisma.quickLink.create({
    data: { label: parsed.data.label, url: parsed.data.url, order: nextOrder },
  });

  await writeAuditLog({
    adminUserId: session.user.id,
    action: "create_quick_link",
    entityType: ENTITY_TYPES.QUICK_LINK,
    entityId: quickLink.id,
    metadata: { label: quickLink.label, url: quickLink.url },
  });

  return NextResponse.json({ quickLink }, { status: 201 });
}
