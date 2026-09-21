import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VideoLibrary } from "@/components/dashboard/video/video-library";
import { NewProjectButton } from "@/components/dashboard/project/new-project-button";
import { ProjectCard } from "@/components/dashboard/project/project-card";
import { listProjects } from "@/lib/projects/service";
import { videoTitle } from "@/lib/video-display";

export const metadata = {
  title: "Videos | YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { deleted } = await searchParams;

  const projects = (await listProjects(session.user.id)).filter((p) => p.status !== "COMPLETED");

  const videos = await prisma.generatedVideo.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      script: true,
      status: true,
      engine: true,
      thumbnailUrl: true,
      errorMessage: true,
      createdAt: true,
      durationSeconds: true,
      estimatedCostCents: true,
      aspectRatio: true,
      projectId: true,
      avatar: { select: { id: true, name: true } },
    },
  });

  // Sum of every completed video's own stored estimate — not recomputed
  // live, so this total stays consistent with what each video shows even if
  // lib/heygen/pricing.ts's rates are updated later (see that file).
  const totalEstimatedCostCents = videos.reduce(
    (sum, v) => sum + (v.estimatedCostCents ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
          <p className="text-muted-foreground">
            Every video generated across all of your avatars, newest first.
            {totalEstimatedCostCents > 0 && (
              <>
                {" "}
                Estimated usage so far:{" "}
                <span className="font-medium text-foreground">
                  ${(totalEstimatedCostCents / 100).toFixed(2)}
                </span>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <NewProjectButton />
          <Button asChild>
            <Link href="/dashboard/avatars">Create a video</Link>
          </Button>
        </div>
      </div>

      {deleted && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {deleted === "partial"
            ? "Video removed from your portal. We couldn't delete it from the video service just now, so it may still exist there."
            : "Video deleted."}
        </p>
      )}

      {projects.length > 0 && (
        <section aria-labelledby="projects-heading" className="space-y-2">
          <h2 id="projects-heading" className="text-base font-semibold tracking-tight">
            Multi-scene projects in progress
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectCard
                  id={p.id}
                  title={p.title}
                  status={p.status}
                  sceneCount={p.sceneCount}
                  updatedAt={p.updatedAt}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {videos.length === 0 && projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <p className="font-medium">No videos yet</p>
            <p className="text-sm text-muted-foreground">
              Pick an avatar, write a script and generate your first video. It only takes a couple of minutes.
            </p>
            <Button asChild>
              <Link href="/dashboard/avatars">Choose an avatar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <VideoLibrary
          videos={videos.map((v) => ({
            id: v.id,
            title: videoTitle(v),
            status: v.status,
            engine: v.engine,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt.toISOString(),
            durationSeconds: v.durationSeconds,
            estimatedCostCents: v.estimatedCostCents,
            aspectRatio: v.aspectRatio,
            errorMessage: v.errorMessage,
            avatarName: v.avatar.name,
            projectId: v.projectId,
          }))}
        />
      )}
    </div>
  );
}
