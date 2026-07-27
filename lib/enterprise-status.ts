import prisma from "@/lib/prisma";

// Returns the name of a suspended enterprise this user belongs to (owner or
// member), or null if they're not affected. A user belonging to multiple
// enterprises with mixed status is still blocked if ANY of them is
// suspended — deliberately simple for now since in practice every account
// seen in this app belongs to at most one enterprise.
export async function getSuspendedEnterpriseName(
  userId: string,
): Promise<string | null> {
  const ownedSuspended = await prisma.enterprise.findFirst({
    where: { ownerUserId: userId, status: "suspended" },
    select: { name: true },
  });
  if (ownedSuspended) return ownedSuspended.name;

  const memberSuspended = await prisma.enterpriseMember.findFirst({
    where: { userId, enterprise: { status: "suspended" } },
    select: { enterprise: { select: { name: true } } },
  });
  return memberSuspended?.enterprise.name ?? null;
}
