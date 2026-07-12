// lib/invites/accept-invite.ts
import prisma from "@/lib/prisma";

export type AcceptInviteResult =
  | { status: "not_found" }
  | { status: "not_pending" }
  | { status: "accepted"; enterpriseName: string };

export async function acceptInvite(
  token: string,
  userId: string,
): Promise<AcceptInviteResult> {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({
      where: { token },
      select: {
        id: true,
        status: true,
        enterpriseId: true,
        roleId: true,
        enterprise: { select: { name: true } },
      },
    });

    if (!invite) {
      return { status: "not_found" as const };
    }

    if (invite.status !== "pending") {
      return { status: "not_pending" as const };
    }

    // Atomic conditional update: only the request that actually flips
    // status "pending" -> "accepted" proceeds to create membership. A
    // concurrent duplicate request (double-click, race) sees count === 0
    // and reports "not_pending" instead of creating a second row.
    const claim = await tx.invite.updateMany({
      where: { id: invite.id, status: "pending" },
      data: { status: "accepted" },
    });

    if (claim.count === 0) {
      return { status: "not_pending" as const };
    }

    await tx.enterpriseMember.upsert({
      where: {
        enterpriseId_userId: {
          enterpriseId: invite.enterpriseId,
          userId,
        },
      },
      create: {
        enterpriseId: invite.enterpriseId,
        userId,
        roleId: invite.roleId,
      },
      update: {},
    });

    return { status: "accepted" as const, enterpriseName: invite.enterprise.name };
  });
}
