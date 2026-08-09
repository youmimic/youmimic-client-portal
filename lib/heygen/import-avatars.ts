import prisma from "@/lib/prisma";
import { writeAuditLog, ENTITY_TYPES } from "@/lib/admin/audit";

const HEYGEN_API_BASE = "https://api.heygen.com";

interface HeyGenListedLook {
  avatar_id: string;
  avatar_name: string;
}

interface HeyGenAvatarGroup {
  id: string;
  name: string;
  group_type: string;
}

interface HeyGenGroupWithLooks {
  groupId: string;
  groupName: string;
  looks: HeyGenListedLook[];
}

function heygenHeaders(): HeadersInit {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey || apiKey === "...") {
    throw new Error("HEYGEN_API_KEY is not configured");
  }
  return { "x-api-key": apiKey };
}

// A HeyGen "avatar_group" is the real avatar identity (one real person); each
// entry inside it is a "look" — a specific outfit/pose/angle variant of that
// same identity, not a distinct avatar. Confirmed against the live account:
// e.g. one person had 21 looks under a single group. Deliberately NOT using
// GET /v2/avatars (the flat "list every avatar" endpoint) — confirmed
// missing real private avatars entirely, on top of being HeyGen's own
// documented legacy endpoint (sunsetting 2026-10-31).
async function fetchAllHeyGenGroups(): Promise<HeyGenGroupWithLooks[]> {
  const headers = heygenHeaders();

  const groupsRes = await fetch(`${HEYGEN_API_BASE}/v2/avatar_group.list`, { headers });
  if (!groupsRes.ok) {
    throw new Error(`HeyGen API returned ${groupsRes.status} listing avatar groups`);
  }
  const groupsJson = (await groupsRes.json()) as { data?: { avatar_group_list?: HeyGenAvatarGroup[] } };
  const privateGroups = (groupsJson.data?.avatar_group_list ?? []).filter((g) => g.group_type === "PRIVATE");

  const result: HeyGenGroupWithLooks[] = [];

  for (const group of privateGroups) {
    const res = await fetch(`${HEYGEN_API_BASE}/v2/avatar_group/${group.id}/avatars`, { headers });
    if (!res.ok) continue; // one bad group shouldn't fail the whole import

    const json = (await res.json()) as { data?: { avatar_list?: unknown[] } };
    const seen = new Set<string>();
    const looks: HeyGenListedLook[] = [];

    for (const item of json.data?.avatar_list ?? []) {
      // Some groups (e.g. "Talking Photo" style entries) return a
      // completely different shape (`id`/`name` instead of
      // `avatar_id`/`avatar_name`) — skip anything that doesn't match the
      // Photo Avatar look shape we actually match against.
      const candidate = item as Partial<HeyGenListedLook>;
      if (typeof candidate.avatar_id !== "string" || typeof candidate.avatar_name !== "string") continue;

      // The same look has been observed duplicated within a single group's
      // response — dedupe defensively regardless of cause.
      if (seen.has(candidate.avatar_id)) continue;
      seen.add(candidate.avatar_id);

      looks.push({ avatar_id: candidate.avatar_id, avatar_name: candidate.avatar_name });
    }

    result.push({ groupId: group.id, groupName: group.name, looks });
  }

  return result;
}

const WORKSPACE_CODE_PATTERN = /YM(\d+)/;

type PlannedNewAvatar = {
  heygenGroupId: string;
  name: string;
  enterpriseId: string;
  enterpriseName: string;
  userId: string;
  looks: HeyGenListedLook[];
};

type PlannedNewLooks = {
  avatarId: string;
  avatarName: string;
  looks: HeyGenListedLook[];
};

type SkipReason = "no_workspace_code" | "unknown_workspace_code";

type SkippedGroup = {
  heygenGroupId: string;
  groupName: string;
  reason: SkipReason;
  workspaceCode?: string;
};

export interface AvatarImportPlan {
  totalHeyGenGroups: number;
  totalHeyGenLooks: number;
  toCreate: PlannedNewAvatar[];
  toAddLooks: PlannedNewLooks[];
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
  skipped: SkippedGroup[];
  skippedSummary: {
    noWorkspaceCode: number;
    unknownWorkspaceCode: Record<string, number>;
  };
}

// Matches by YM### workspace code only — not full heygenWorkspaceId string
// matching, which real data proved unreliable (look names carry a date
// prefix, a team member's name instead of the enterprise name, or no
// enterprise-identifying text at all). The code is read off any look's name
// within the group (all looks in a group share the same code in practice) —
// anything that isn't an unambiguous code match is skipped and reported,
// never guessed.
export async function planAvatarImport(): Promise<AvatarImportPlan> {
  const [enterprises, existingAvatars, groups] = await Promise.all([
    prisma.enterprise.findMany({
      where: { heygenWorkspaceId: { not: null } },
      select: { id: true, name: true, ownerUserId: true, heygenWorkspaceId: true },
    }),
    prisma.avatar.findMany({
      where: { heygenGroupId: { not: null } },
      select: { id: true, name: true, heygenGroupId: true, looks: { select: { heygenLookId: true } } },
    }),
    fetchAllHeyGenGroups(),
  ]);

  const byCode = new Map<string, (typeof enterprises)[number]>();
  for (const ent of enterprises) {
    const match = ent.heygenWorkspaceId?.match(WORKSPACE_CODE_PATTERN);
    if (match) byCode.set(match[1], ent);
  }

  const existingByGroupId = new Map(existingAvatars.map((a) => [a.heygenGroupId as string, a]));

  const toCreate: PlannedNewAvatar[] = [];
  const toAddLooks: PlannedNewLooks[] = [];
  const skipped: SkippedGroup[] = [];
  const unknownWorkspaceCode: Record<string, number> = {};
  let totalHeyGenLooks = 0;

  for (const group of groups) {
    totalHeyGenLooks += group.looks.length;
    if (group.looks.length === 0) continue;

    const existing = existingByGroupId.get(group.groupId);
    if (existing) {
      const knownLookIds = new Set(existing.looks.map((l) => l.heygenLookId));
      const newLooks = group.looks.filter((l) => !knownLookIds.has(l.avatar_id));
      if (newLooks.length > 0) {
        toAddLooks.push({ avatarId: existing.id, avatarName: existing.name, looks: newLooks });
      }
      continue;
    }

    // Not yet imported at all — resolve the enterprise from any look's name.
    let codeMatch: RegExpMatchArray | null = null;
    for (const look of group.looks) {
      codeMatch = look.avatar_name.match(WORKSPACE_CODE_PATTERN);
      if (codeMatch) break;
    }

    if (!codeMatch) {
      skipped.push({ heygenGroupId: group.groupId, groupName: group.groupName, reason: "no_workspace_code" });
      continue;
    }

    const enterprise = byCode.get(codeMatch[1]);
    if (!enterprise) {
      unknownWorkspaceCode[codeMatch[1]] = (unknownWorkspaceCode[codeMatch[1]] ?? 0) + 1;
      skipped.push({
        heygenGroupId: group.groupId,
        groupName: group.groupName,
        reason: "unknown_workspace_code",
        workspaceCode: codeMatch[1],
      });
      continue;
    }

    toCreate.push({
      heygenGroupId: group.groupId,
      name: group.groupName,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name,
      userId: enterprise.ownerUserId,
      looks: group.looks,
    });
  }

  const byEnterpriseMap = new Map<string, { enterpriseId: string; enterpriseName: string; count: number }>();
  for (const c of toCreate) {
    const existing = byEnterpriseMap.get(c.enterpriseId);
    if (existing) existing.count++;
    else byEnterpriseMap.set(c.enterpriseId, { enterpriseId: c.enterpriseId, enterpriseName: c.enterpriseName, count: 1 });
  }

  return {
    totalHeyGenGroups: groups.length,
    totalHeyGenLooks,
    toCreate,
    toAddLooks,
    byEnterprise: [...byEnterpriseMap.values()].sort((a, b) => b.count - a.count),
    skipped,
    skippedSummary: {
      noWorkspaceCode: skipped.filter((s) => s.reason === "no_workspace_code").length,
      unknownWorkspaceCode,
    },
  };
}

export interface AvatarImportResult {
  created: number;
  looksAdded: number;
  byEnterprise: { enterpriseId: string; enterpriseName: string; count: number }[];
}

// Re-plans immediately before writing (not reusing a caller-supplied plan) so
// a stale preview can never be blindly applied against data that's since
// changed (e.g. someone else already imported in the meantime).
export async function executeAvatarImport(adminUserId: string): Promise<AvatarImportResult> {
  const plan = await planAvatarImport();
  let looksAdded = 0;

  for (const item of plan.toCreate) {
    const avatar = await prisma.avatar.create({
      data: {
        userId: item.userId,
        enterpriseId: item.enterpriseId,
        name: item.name,
        heygenGroupId: item.heygenGroupId,
        heygenAvatarId: item.looks[0]?.avatar_id ?? null,
        looks: {
          create: item.looks.map((look) => ({
            heygenLookId: look.avatar_id,
            name: look.avatar_name,
          })),
        },
      },
      select: { id: true },
    });
    looksAdded += item.looks.length;

    await writeAuditLog({
      adminUserId,
      action: "bulk_import_avatar_heygen",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: avatar.id,
      targetUserId: item.userId,
      metadata: {
        heygenGroupId: item.heygenGroupId,
        enterpriseId: item.enterpriseId,
        enterpriseName: item.enterpriseName,
        lookCount: item.looks.length,
      },
    });
  }

  for (const item of plan.toAddLooks) {
    await prisma.avatarLook.createMany({
      data: item.looks.map((look) => ({
        avatarId: item.avatarId,
        heygenLookId: look.avatar_id,
        name: look.avatar_name,
      })),
    });
    looksAdded += item.looks.length;

    await writeAuditLog({
      adminUserId,
      action: "bulk_import_avatar_heygen_looks",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: item.avatarId,
      metadata: { addedLookCount: item.looks.length },
    });
  }

  return { created: plan.toCreate.length, looksAdded, byEnterprise: plan.byEnterprise };
}
