import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { syncAvatarFromHeyGen } from "@/lib/heygen/sync";

export const metadata = {
  title: "Avatars — YouMimic Portal",
};

async function fetchAvatars(userId: string) {
  return prisma.avatar.findMany({
    where: { userId },
    include: { enterprise: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

type AvatarRow = Awaited<ReturnType<typeof fetchAvatars>>[number];

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  processing:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  training:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  // Set only by a live HeyGen sync — the avatar subject needs to record
  // consent in HeyGen before training/generation can proceed.
  pending_consent:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ready:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending_consent: "Awaiting consent",
};

function StatusBadge({ status }: { status: string }) {
  const classes =
    STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status.toLowerCase()] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}
    >
      {label}
    </span>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function AvatarThumbnail({
  previewUrl,
  name,
}: {
  previewUrl: string | null;
  name: string;
}) {
  if (previewUrl) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
        <Image
          src={previewUrl}
          alt={`${name} preview`}
          fill
          unoptimized
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-t-xl bg-muted">
      <UserCircle2
        className="h-12 w-12 text-muted-foreground/30"
        aria-hidden="true"
      />
    </div>
  );
}

function AvatarCard({ avatar }: { avatar: AvatarRow }) {
  return (
    <Card className="overflow-hidden pt-0">
      <AvatarThumbnail previewUrl={avatar.previewUrl} name={avatar.name} />

      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {avatar.name}
          </CardTitle>
          <StatusBadge status={avatar.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-4">
        {avatar.enterprise && (
          <p className="text-xs text-muted-foreground">
            {avatar.enterprise.name}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Created {formatDate(avatar.createdAt)}
        </p>

        {avatar.heygenAvatarId && (
          <p
            className="truncate font-mono text-xs text-muted-foreground/60"
            title={avatar.heygenAvatarId}
          >
            ID: {avatar.heygenAvatarId}
          </p>
        )}

        {avatar.videoUrl && (
          <a
            href={avatar.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Watch preview video
          </a>
        )}

        {avatar.status.toLowerCase() === "ready" && avatar.heygenAvatarId && (
          <Button asChild size="sm" className="w-full">
            <Link href={`/dashboard/avatars/${avatar.id}/studio`}>Use Avatar</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AvatarGrid({ avatars }: { avatars: AvatarRow[] }) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {avatars.length === 1 ? "1 avatar" : `${avatars.length} avatars`}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((avatar) => (
          <AvatarCard key={avatar.id} avatar={avatar} />
        ))}
      </div>
    </div>
  );
}

// Best-effort live refresh: for every avatar linked to a real HeyGen avatar,
// pull current status/preview/video and merge it into the render list. Uses
// Promise.allSettled so one slow/failing HeyGen call (network issue, avatar
// deleted upstream, etc.) never blocks or breaks the rest of the page — on
// failure the row simply falls back to whatever was already in the DB.
async function withLiveHeyGenStatus(avatars: AvatarRow[]): Promise<AvatarRow[]> {
  const syncable = avatars.filter((a) => a.heygenAvatarId);
  if (syncable.length === 0) return avatars;

  const results = await Promise.allSettled(
    syncable.map((a) => syncAvatarFromHeyGen(a.id, a.heygenAvatarId as string)),
  );

  const byId = new Map(syncable.map((a, i) => [a.id, results[i]] as const));

  return avatars.map((avatar) => {
    const result = byId.get(avatar.id);
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
  const avatars = await withLiveHeyGenStatus(dbAvatars);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avatars</h1>
        <p className="text-muted-foreground">
          Your AI avatars provisioned through the YouMimic platform.
        </p>
      </div>

      {avatars.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle2
              className="mb-4 h-10 w-10 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="text-base font-medium">No avatars yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your AI avatars will appear here once they have been provisioned.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AvatarGrid avatars={avatars} />
      )}
    </div>
  );
}
