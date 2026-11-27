import prisma from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import type { AvatarOption } from "@/lib/projects/rules";

// Who may use custom avatar backgrounds right now: everyone once the
// "backgrounds for clients" launch switch is on; until then, admins only.
// Checked on the server when generating, and used to hide the option in the
// editor, so it can't be reached by a crafted request either.
export async function backgroundsEnabledFor(userId: string): Promise<boolean> {
  if (await getSetting("backgroundsForClients")) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { adminRole: true } });
  return !!user?.adminRole;
}

// Avatar options as this user may use them: with backgrounds off for them,
// every look reads as "not checked", which hides the option and makes
// readiness refuse a background (lookSupportsBackground).
export function withBackgroundAccess(avatars: AvatarOption[], enabled: boolean): AvatarOption[] {
  if (enabled) return avatars;
  return avatars.map((a) => ({ ...a, looks: a.looks.map((l) => ({ ...l, backgroundRemoval: "UNKNOWN" as const })) }));
}
