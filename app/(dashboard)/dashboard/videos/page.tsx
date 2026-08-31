import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GeneratedVideoRow } from "@/components/dashboard/generated-video-row";

export const metadata = {
  title: "Videos — YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const videos = await prisma.generatedVideo.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      script: true,
      status: true,
      engine: true,
      videoUrl: true,
      thumbnailUrl: true,
      errorMessage: true,
      createdAt: true,
      durationSeconds: true,
      estimatedCostCents: true,
      avatar: { select: { id: true, name: true } },
    },
  });

  // Sum of every completed video's own stored estimate — not recomputed
  // live, so this total stays consistent with what each row shows even if
  // lib/heygen/pricing.ts's rates are updated later (see that file).
  const totalEstimatedCostCents = videos.reduce(
    (sum, v) => sum + (v.estimatedCostCents ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-muted-foreground">
          Every video generated across all of your avatars, newest first.
          {totalEstimatedCostCents > 0 && (
            <>
              {" "}
              Estimated HeyGen usage so far:{" "}
              <span className="font-medium text-foreground">
                ${(totalEstimatedCostCents / 100).toFixed(2)}
              </span>
              .
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {videos.length > 0
              ? `${videos.length} video${videos.length === 1 ? "" : "s"}`
              : "Your videos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                No videos generated yet. Head to an avatar&apos;s studio to
                write a script and generate your first one.
              </p>
              <Button asChild>
                <Link href="/dashboard/avatars">Go to Avatars</Link>
              </Button>
            </div>
          ) : (
            videos.map((v) => (
              <GeneratedVideoRow
                key={v.id}
                video={{ ...v, createdAt: v.createdAt.toISOString() }}
                avatar={v.avatar}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
