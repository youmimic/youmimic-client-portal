import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { VideoDetail } from "@/components/dashboard/video/video-detail";
import { videoTitle } from "@/lib/video-display";

export const metadata = {
  title: "Video | YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const { new: isNew } = await searchParams;

  const video = await prisma.generatedVideo.findFirst({
    where: { id, userId: session.user.id },
    include: { avatar: { select: { id: true, name: true } } },
  });
  if (!video) notFound();

  // Other videos made from the same script on this avatar, i.e. earlier or
  // later regenerations and duplicates.
  const related = await prisma.generatedVideo.findMany({
    where: { userId: session.user.id, avatarId: video.avatarId, script: video.script, id: { not: video.id } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, title: true, script: true, status: true, createdAt: true },
  });

  const title = videoTitle(video);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/dashboard/videos" className="hover:text-foreground transition-colors">
          Videos
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">{title}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

      <VideoDetail
        justCreated={isNew === "1"}
        related={related.map((r) => ({
          id: r.id,
          title: videoTitle(r),
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        video={{
          id: video.id,
          avatarId: video.avatar.id,
          avatarName: video.avatar.name,
          title: video.title ?? "",
          script: video.script,
          status: video.status,
          engine: video.engine,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          errorMessage: video.errorMessage,
          createdAt: video.createdAt.toISOString(),
          completedAt: video.completedAt?.toISOString() ?? null,
          durationSeconds: video.durationSeconds,
          estimatedCostCents: video.estimatedCostCents,
          aspectRatio: video.aspectRatio,
          resolution: video.resolution,
          voiceId: video.voiceId,
          voiceName: video.voiceName,
          avatarLookId: video.avatarLookId,
        }}
      />
    </div>
  );
}
