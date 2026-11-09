import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicAvatarsCard } from "@/components/admin/public-avatar-actions";
import { canManageAvatars } from "@/lib/admin/rbac";
import { rollupAvatarDisplay } from "@/lib/heygen/sync";

export const metadata = {
  title: "Avatars | YouMimic Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminAvatarsPage() {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const avatars = await prisma.avatar.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      heygenAvatarId: true,
      previewUrl: true,
      looks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, heygenLookId: true, status: true, previewUrl: true },
      },
    },
  });

  // Same rollup as the per-user admin page and the customer dashboard grid:
  // an avatar imported from HeyGen (with looks) shows status/preview derived
  // from its looks, not its own (stale) columns.
  const displayAvatars = avatars.map((avatar) => {
    if (avatar.looks.length === 0) {
      return { ...avatar, lookCount: 0 };
    }
    const rollup = rollupAvatarDisplay(avatar.looks);
    return { ...avatar, status: rollup.status, previewUrl: rollup.previewUrl, lookCount: avatar.looks.length };
  });

  const canManage = canManageAvatars(session.user.adminRole as AdminRole | null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avatars</h1>
        <p className="text-muted-foreground">
          Public avatars any signed-in user can generate a video with, regardless of their own avatar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Public avatars</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicAvatarsCard avatars={displayAvatars} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}
