import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, UserCircle2, Video } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvatarGallery, type GalleryAvatar } from "@/components/dashboard/avatar/avatar-gallery";
import { syncAvatarFromHeyGen, syncAvatarLookFromHeyGen, rollupAvatarDisplay } from "@/lib/heygen/sync";

export const metadata = {
  title: "Avatars | YouMimic Portal",
};

async function fetchAvatars(userId: string) {
  return prisma.avatar.findMany({
    where: { userId },
    include: {
      enterprise: { select: { name: true } },
      looks: {
        orderBy: { name: "asc" },
        select: { id: true, heygenLookId: true, name: true, status: true, previewUrl: true, videoUrl: true },
      },
      _count: { select: { generatedVideos: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

type AvatarRow = Awaited<ReturnType<typeof fetchAvatars>>[number];

function toGalleryAvatar(avatar: AvatarRow): GalleryAvatar {
  const hasLooks = avatar.looks.length > 0;
  const rollup = hasLooks ? rollupAvatarDisplay(avatar.looks) : null;
  const status = rollup?.status ?? avatar.status;
  return {
    id: avatar.id,
    name: avatar.name,
    enterpriseName: avatar.enterprise?.name ?? null,
    createdAt: avatar.createdAt.toISOString(),
    status,
    previewUrl: rollup?.previewUrl ?? avatar.previewUrl,
    introVideoUrl: rollup?.videoUrl ?? avatar.videoUrl,
    usable: hasLooks ? status === "ready" : status.toLowerCase() === "ready" && !!avatar.heygenAvatarId,
    looks: avatar.looks.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      previewUrl: l.previewUrl,
      videoUrl: l.videoUrl,
    })),
    videoCount: avatar._count.generatedVideos,
  };
}

// Best-effort live refresh: for every avatar with looks, sync each look; for
// legacy avatars with no looks, sync the avatar itself directly. Uses
// Promise.allSettled so one slow/failing HeyGen call (network issue, look
// deleted upstream, etc.) never blocks or breaks the rest of the page — on
// failure the row simply falls back to whatever was already in the DB.
async function withLiveHeyGenStatus(avatars: AvatarRow[]): Promise<AvatarRow[]> {
  const allLooks = avatars.flatMap((a) => a.looks.map((l) => ({ avatarId: a.id, look: l })));
  const legacySyncable = avatars.filter((a) => a.looks.length === 0 && a.heygenAvatarId);

  const [lookResults, legacyResults] = await Promise.all([
    Promise.allSettled(allLooks.map(({ look }) => syncAvatarLookFromHeyGen(look.id, look.heygenLookId))),
    Promise.allSettled(legacySyncable.map((a) => syncAvatarFromHeyGen(a.id, a.heygenAvatarId as string))),
  ]);

  const lookResultById = new Map(allLooks.map(({ look }, i) => [look.id, lookResults[i]] as const));
  const legacyResultById = new Map(legacySyncable.map((a, i) => [a.id, legacyResults[i]] as const));

  return avatars.map((avatar) => {
    if (avatar.looks.length > 0) {
      const looks = avatar.looks.map((look) => {
        const result = lookResultById.get(look.id);
        if (!result || result.status !== "fulfilled" || !result.value.ok) return look;
        const { status, previewUrl, videoUrl } = result.value;
        return {
          ...look,
          status: status ?? look.status,
          previewUrl: previewUrl ?? look.previewUrl,
          videoUrl: videoUrl ?? look.videoUrl,
        };
      });
      return { ...avatar, looks };
    }

    const result = legacyResultById.get(avatar.id);
    if (!result || result.status !== "fulfilled" || !result.value.ok) return avatar;
    const { status, previewUrl, videoUrl } = result.value;
    return {
      ...avatar,
      status: status ?? avatar.status,
      previewUrl: previewUrl ?? avatar.previewUrl,
      videoUrl: videoUrl ?? avatar.videoUrl,
    };
  });
}

export default async function AvatarsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbAvatars = await fetchAvatars(session.user.id);
  const avatars = (await withLiveHeyGenStatus(dbAvatars)).map(toGalleryAvatar);
  const ready = avatars.filter((a) => a.usable);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Avatars</h1>
          <p className="text-muted-foreground">
            {avatars.length === 0
              ? "Your AI avatars will appear here."
              : `${avatars.length} ${avatars.length === 1 ? "avatar" : "avatars"}, ${ready.length} ready to use. Pick one to start a video.`}
          </p>
        </div>
        {ready.length === 1 && (
          <Button asChild>
            <Link href={`/dashboard/avatars/${ready[0].id}/studio`}>
              <Video className="h-4 w-4" aria-hidden="true" />
              Create a video
            </Link>
          </Button>
        )}
      </div>

      {avatars.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-10">
            <UserCircle2 className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            <div>
              <p className="text-base font-medium">No avatars yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Avatars are created by our team from a capture session. Once yours has been set up, it will show up
                here and you can start making videos straight away.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/bookings">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Book a capture session
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AvatarGallery avatars={avatars} />
      )}
    </div>
  );
}
