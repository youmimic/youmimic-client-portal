import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, UserCircle2 } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoWorkspace, type WorkspaceInitialValues } from "@/components/dashboard/video/video-workspace";
import { VideoStatusBadge } from "@/components/dashboard/video/video-status-badge";
import { formatDateTime, videoTitle } from "@/lib/video-display";
import { VIDEO_ASPECT_RATIOS } from "@/lib/validations/video";

export const metadata = {
  title: "Create video | YouMimic Portal",
};

export const dynamic = "force-dynamic";

const ENGINE_FROM_PRISMA = {
  AVATAR_III: "avatar_iii",
  AVATAR_IV: "avatar_iv",
  AVATAR_V: "avatar_v",
} as const;

export default async function AvatarStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ avatarId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { avatarId } = await params;
  const { from } = await searchParams;

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId: session.user.id },
    select: {
      id: true,
      name: true,
      status: true,
      heygenAvatarId: true,
      previewUrl: true,
      looks: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true, previewUrl: true, videoUrl: true },
      },
      generatedVideos: {
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, title: true, script: true, status: true, createdAt: true },
      },
    },
  });

  if (!avatar) notFound();

  // Middleware already gates this route on an active subscription — this
  // check is about the avatar itself, not billing: with looks (imported from
  // HeyGen), at least one look must be ready; without looks (legacy manual
  // link), the avatar itself must be ready.
  const usable =
    avatar.looks.length > 0
      ? avatar.looks.some((l) => l.status === "ready")
      : avatar.status === "ready" && !!avatar.heygenAvatarId;

  // Duplicate: prefill from one of this user's own videos on this avatar.
  let initial: WorkspaceInitialValues | undefined;
  if (from) {
    const source = await prisma.generatedVideo.findFirst({
      where: { id: from, userId: session.user.id, avatarId: avatar.id },
      select: {
        title: true,
        script: true,
        engine: true,
        aspectRatio: true,
        resolution: true,
        voiceId: true,
        voiceName: true,
        avatarLookId: true,
      },
    });
    if (source) {
      const lookStillReady = avatar.looks.some((l) => l.id === source.avatarLookId && l.status === "ready");
      initial = {
        title: source.title ? `${source.title} (copy)` : "",
        script: source.script,
        lookId: lookStillReady ? source.avatarLookId : (avatar.looks.find((l) => l.status === "ready")?.id ?? null),
        engine: ENGINE_FROM_PRISMA[source.engine],
        aspectRatio:
          source.aspectRatio && (VIDEO_ASPECT_RATIOS as readonly string[]).includes(source.aspectRatio)
            ? source.aspectRatio
            : "16:9",
        resolution: source.resolution,
        voice: source.voiceId ? { id: source.voiceId, name: source.voiceName ?? "Chosen voice" } : null,
      };
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/dashboard/avatars" className="hover:text-foreground transition-colors">
          Avatars
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">{avatar.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create a video</h1>
          <p className="text-muted-foreground">
            Write a script, choose how it looks and sounds, then generate a video of{" "}
            <span className="font-medium text-foreground">{avatar.name}</span>.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/videos">All videos</Link>
        </Button>
      </div>

      {usable ? (
        <VideoWorkspace
          avatarId={avatar.id}
          avatarName={avatar.name}
          looks={avatar.looks}
          initial={initial}
          resetFrom={initial ? from : undefined}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <UserCircle2 className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="font-medium">This avatar isn&apos;t ready yet</p>
              <p className="text-sm text-muted-foreground">
                You can create videos as soon as at least one look has finished processing. Check back soon.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/avatars">Back to avatars</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {usable && avatar.generatedVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent videos with {avatar.name}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {avatar.generatedVideos.map((v) => (
              <Link
                key={v.id}
                href={`/dashboard/videos/${v.id}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{videoTitle(v)}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(v.createdAt.toISOString())}</span>
                </span>
                <VideoStatusBadge status={v.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
