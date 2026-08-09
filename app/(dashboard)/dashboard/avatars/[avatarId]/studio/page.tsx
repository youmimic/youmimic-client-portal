import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { AvatarStudio } from "@/components/dashboard/avatar-studio";

export const metadata = {
  title: "Avatar Studio — YouMimic Portal",
};

export const dynamic = "force-dynamic";

export default async function AvatarStudioPage({
  params,
}: {
  params: Promise<{ avatarId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { avatarId } = await params;

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
        select: {
          id: true,
          script: true,
          status: true,
          videoUrl: true,
          thumbnailUrl: true,
          errorMessage: true,
          createdAt: true,
        },
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

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/dashboard/avatars" className="hover:text-foreground transition-colors">
          Avatars
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">{avatar.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avatar Studio</h1>
        <p className="text-muted-foreground">
          Generate a video of <span className="font-medium text-foreground">{avatar.name}</span> saying whatever
          you write below.
        </p>
      </div>

      {usable ? (
        <AvatarStudio
          avatarId={avatar.id}
          looks={avatar.looks}
          videos={avatar.generatedVideos.map((v) => ({
            ...v,
            createdAt: v.createdAt.toISOString(),
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          This avatar isn&apos;t ready to generate videos from yet.
        </p>
      )}
    </div>
  );
}
