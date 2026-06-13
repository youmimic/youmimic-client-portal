import Image from "next/image";
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
  ready:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const classes =
    STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}
    >
      {status}
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

export default async function AvatarsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const avatars = await fetchAvatars(session.user.id);

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
