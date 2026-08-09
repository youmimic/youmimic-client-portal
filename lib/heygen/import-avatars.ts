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

// Some groups (e.g. "Talking Photo" style entries) return a completely
// different shape (`id`/`name` instead of `avatar_id`/`avatar_name`) — skip
// anything that doesn't match the Photo Avatar look shape we actually match
// against. The same look has also been observed duplicated within a single
// group's response — dedupe defensively regardless of cause.
async function fetchLooksForGroup(groupId: string, headers: HeadersInit): Promise<HeyGenListedLook[]> {
  const res = await fetch(`${HEYGEN_API_BASE}/v2/avatar_group/${groupId}/avatars`, { headers });
  if (!res.ok) return [];

  const json = (await res.json()) as { data?: { avatar_list?: unknown[] } };
  const seen = new Set<string>();
  const looks: HeyGenListedLook[] = [];

  for (const item of json.data?.avatar_list ?? []) {
    const candidate = item as Partial<HeyGenListedLook>;
    if (typeof candidate.avatar_id !== "string" || typeof candidate.avatar_name !== "string") continue;
    if (seen.has(candidate.avatar_id)) continue;
    seen.add(candidate.avatar_id);
    looks.push({ avatar_id: candidate.avatar_id, avatar_name: candidate.avatar_name });
  }

  return looks;
}

async function fetchPrivateHeyGenGroups(headers: HeadersInit): Promise<HeyGenAvatarGroup[]> {
  const groupsRes = await fetch(`${HEYGEN_API_BASE}/v2/avatar_group.list`, { headers });
  if (!groupsRes.ok) {
    throw new Error(`HeyGen API returned ${groupsRes.status} listing avatar groups`);
  }
  const groupsJson = (await groupsRes.json()) as { data?: { avatar_group_list?: HeyGenAvatarGroup[] } };
  return (groupsJson.data?.avatar_group_list ?? []).filter((g) => g.group_type === "PRIVATE");
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
  const privateGroups = await fetchPrivateHeyGenGroups(headers);

  const result: HeyGenGroupWithLooks[] = [];
  for (const group of privateGroups) {
    const looks = await fetchLooksForGroup(group.id, headers);
    result.push({ groupId: group.id, groupName: group.name, looks });
  }

  return result;
}

// Looks up a single group by id — for the admin "import a specific avatar
// identity by group id" action, where an admin already has a group id in
// hand (e.g. copied from HeyGen's own dashboard) rather than relying on
// workspace-code auto-matching. Only matches PRIVATE groups, same as the
// bulk import. Returns null rather than throwing if the id isn't found, so
// the caller can surface a clear "not found" error instead of a generic one.
async function fetchHeyGenGroupById(groupId: string): Promise<HeyGenGroupWithLooks | null> {
  const headers = heygenHeaders();
  const privateGroups = await fetchPrivateHeyGenGroups(headers);
  const group = privateGroups.find((g) => g.id === groupId);
  if (!group) return null;

  const looks = await fetchLooksForGroup(group.id, headers);
  return { groupId: group.id, groupName: group.name, looks };
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

// ---------------------------------------------------------------------------
// Import a single avatar identity by HeyGen group id — for identities that
// can't go through the automated bulk import (no recognizable workspace
// code in their look names, e.g. Neil McGregor) or that need to be routed to
// a specific user/enterprise an admin already knows, rather than
// auto-matched.
// ---------------------------------------------------------------------------

export type AvatarGroupLinkStatus = "new" | "add_looks" | "no_new_looks";

export interface AvatarGroupLinkPlan {
  heygenGroupId: string;
  groupName: string;
  totalLooks: number;
  status: AvatarGroupLinkStatus;
  existingAvatarId: string | null;
  existingAvatarName: string | null;
  looks: HeyGenListedLook[];
}

export async function planAvatarGroupLink(userId: string, heygenGroupId: string): Promise<AvatarGroupLinkPlan> {
  const group = await fetchHeyGenGroupById(heygenGroupId);
  if (!group) {
    throw new Error(`No PRIVATE HeyGen avatar group found with id "${heygenGroupId}"`);
  }
  if (group.looks.length === 0) {
    throw new Error(`This HeyGen avatar group ("${group.groupName}") has no looks in it`);
  }

  const existing = await prisma.avatar.findUnique({
    where: { heygenGroupId },
    select: { id: true, userId: true, name: true, looks: { select: { heygenLookId: true } } },
  });

  if (existing && existing.userId !== userId) {
    throw new Error(
      `This avatar identity is already linked to a different user (as "${existing.name}") — unlink it there first.`,
    );
  }

  if (existing) {
    const knownLookIds = new Set(existing.looks.map((l) => l.heygenLookId));
    const newLooks = group.looks.filter((l) => !knownLookIds.has(l.avatar_id));
    return {
      heygenGroupId,
      groupName: group.groupName,
      totalLooks: group.looks.length,
      status: newLooks.length > 0 ? "add_looks" : "no_new_looks",
      existingAvatarId: existing.id,
      existingAvatarName: existing.name,
      looks: newLooks,
    };
  }

  return {
    heygenGroupId,
    groupName: group.groupName,
    totalLooks: group.looks.length,
    status: "new",
    existingAvatarId: null,
    existingAvatarName: null,
    looks: group.looks,
  };
}

export interface AvatarGroupLinkResult {
  avatarId: string;
  created: boolean;
  looksAdded: number;
}

// Re-plans immediately before writing, same reasoning as executeAvatarImport
// — never blindly apply a stale preview.
export async function executeAvatarGroupLink(
  adminUserId: string,
  userId: string,
  heygenGroupId: string,
  enterpriseId: string | null,
): Promise<AvatarGroupLinkResult> {
  const plan = await planAvatarGroupLink(userId, heygenGroupId);

  if (plan.status === "new") {
    const avatar = await prisma.avatar.create({
      data: {
        userId,
        enterpriseId,
        name: plan.groupName,
        heygenGroupId,
        heygenAvatarId: plan.looks[0]?.avatar_id ?? null,
        looks: {
          create: plan.looks.map((look) => ({ heygenLookId: look.avatar_id, name: look.avatar_name })),
        },
      },
      select: { id: true },
    });

    await writeAuditLog({
      adminUserId,
      action: "link_avatar_group",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: avatar.id,
      targetUserId: userId,
      metadata: { heygenGroupId, enterpriseId, lookCount: plan.looks.length },
    });

    return { avatarId: avatar.id, created: true, looksAdded: plan.looks.length };
  }

  if (plan.status === "add_looks" && plan.existingAvatarId) {
    await prisma.avatarLook.createMany({
      data: plan.looks.map((look) => ({
        avatarId: plan.existingAvatarId as string,
        heygenLookId: look.avatar_id,
        name: look.avatar_name,
      })),
    });

    await writeAuditLog({
      adminUserId,
      action: "add_avatar_looks",
      entityType: ENTITY_TYPES.AVATAR,
      entityId: plan.existingAvatarId,
      targetUserId: userId,
      metadata: { addedLookCount: plan.looks.length },
    });

    return { avatarId: plan.existingAvatarId, created: false, looksAdded: plan.looks.length };
  }

  // no_new_looks — already fully imported, nothing to do.
  return { avatarId: plan.existingAvatarId as string, created: false, looksAdded: 0 };
}
