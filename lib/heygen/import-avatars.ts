import prisma from "@/lib/prisma";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";

const HEYGEN_API_BASE = "https://api.heygen.com";

interface HeyGenListedAvatar {
  avatar_id: string;
  avatar_name: string;
}

async function fetchAllHeyGenAvatars(): Promise<HeyGenListedAvatar[]> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey || apiKey === "...") {
    throw new Error("HEYGEN_API_KEY is not configured");
  }

  const res = await fetch(`${HEYGEN_API_BASE}/v2/avatars`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`HeyGen API returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: { avatars?: HeyGenListedAvatar[] } };
  return json.data?.avatars ?? [];
}

const WORKSPACE_CODE_PATTERN = /YM(\d+)/;

type PlannedCreate = {
  heygenAvatarId: string;
  name: string;
  enterpriseId: string;
  enterpriseName: string;
  userId: string;
};

type SkipReason = "no_workspace_code" | "unknown_workspace_code" | "already_linked";

type Skipped = {
  heygenAvatarId: string;
  name: string;
  reason: SkipReason;
  workspaceCode?: string;
};

export interface AvatarImportPlan {
  totalHeyGenAvatars: number;
  toCreate: PlannedCreate[];
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
  skipped: Skipped[];
  skippedSummary: {
    alreadyLinked: number;
    noWorkspaceCode: number;
    unknownWorkspaceCode: Record<string, number>;
  };
}

// Matches by YM### workspace code only — not full heygenWorkspaceId string
// matching, which real data proved unreliable (avatar names carry a date
// prefix, a team member's name instead of the enterprise name, or no
// enterprise-identifying text at all). Anything that isn't an unambiguous
// code match is skipped and reported, never guessed.
export async function planAvatarImport(): Promise<AvatarImportPlan> {
  const [enterprises, existingHeygenIds, heygenAvatars] = await Promise.all([
    prisma.enterprise.findMany({
      where: { heygenWorkspaceId: { not: null } },
      select: { id: true, name: true, ownerUserId: true, heygenWorkspaceId: true },
    }),
    prisma.avatar.findMany({
      where: { heygenAvatarId: { not: null } },
      select: { heygenAvatarId: true },
    }),
    fetchAllHeyGenAvatars(),
  ]);

  const byCode = new Map<string, (typeof enterprises)[number]>();
  for (const ent of enterprises) {
    const match = ent.heygenWorkspaceId?.match(WORKSPACE_CODE_PATTERN);
    if (match) byCode.set(match[1], ent);
  }

  const alreadyLinkedIds = new Set(existingHeygenIds.map((a) => a.heygenAvatarId));

  const toCreate: PlannedCreate[] = [];
  const skipped: Skipped[] = [];
  const unknownWorkspaceCode: Record<string, number> = {};

  for (const avatar of heygenAvatars) {
    if (alreadyLinkedIds.has(avatar.avatar_id)) {
      skipped.push({ heygenAvatarId: avatar.avatar_id, name: avatar.avatar_name, reason: "already_linked" });
      continue;
    }

    const codeMatch = avatar.avatar_name.match(WORKSPACE_CODE_PATTERN);
    if (!codeMatch) {
      skipped.push({ heygenAvatarId: avatar.avatar_id, name: avatar.avatar_name, reason: "no_workspace_code" });
      continue;
    }

    const enterprise = byCode.get(codeMatch[1]);
    if (!enterprise) {
      unknownWorkspaceCode[codeMatch[1]] = (unknownWorkspaceCode[codeMatch[1]] ?? 0) + 1;
      skipped.push({
        heygenAvatarId: avatar.avatar_id,
        name: avatar.avatar_name,
        reason: "unknown_workspace_code",
        workspaceCode: codeMatch[1],
      });
      continue;
    }

    toCreate.push({
      heygenAvatarId: avatar.avatar_id,
      name: avatar.avatar_name,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      userId: enterprise.ownerUserId,
    });
  }

  const byEnterpriseMap = new Map<string, { enterpriseId: string; enterpriseName: string; count: number }>();
  for (const c of toCreate) {
    const existing = byEnterpriseMap.get(c.enterpriseId);
    if (existing) existing.count++;
    else byEnterpriseMap.set(c.enterpriseId, { enterpriseId: c.enterpriseId, enterpriseName: c.enterpriseName, count: 1 });
  }

  return {
    totalHeyGenAvatars: heygenAvatars.length,
    toCreate,
    byEnterprise: [...byEnterpriseMap.values()].sort((a, b) => b.count - a.count),
    skipped,
    skippedSummary: {
      alreadyLinked: skipped.filter((s) => s.reason === "already_linked").length,
      noWorkspaceCode: skipped.filter((s) => s.reason === "no_workspace_code").length,
      unknownWorkspaceCode,
    },
  };
}

export interface AvatarImportResult {
  created: number;
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
}

// Re-plans immediately before writing (not reusing a caller-supplied plan) so
// a stale preview can never be blindly applied against data that's since
// changed (e.g. someone else already imported in the meantime).
export async function executeAvatarImport(adminUserId: string): Promise<AvatarImportResult> {
  const plan = await planAvatarImport();

  for (const item of plan.toCreate) {
    const avatar = await prisma.avatar.create({
      data: {
        userId: item.userId,
        enterpriseId: item.enterpriseId,
        name: item.name,
        heygenAvatarId: item.heygenAvatarId,
      },
      select: { id: true },
    });

    await writeAuditLog({
      adminUserId,
      action: "bulk_import_avatar_heygen",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: avatar.id,
      targetUserId: item.userId,
      metadata: { heygenAvatarId: item.heygenAvatarId, enterpriseId: item.enterpriseId, enterpriseName: item.enterpriseName },
    });
  }

  return { created: plan.toCreate.length, byEnterprise: plan.byEnterprise };
}
