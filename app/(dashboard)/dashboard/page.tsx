import Link from "next/link";
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  Film,
  Languages,
  Presentation,
  Sparkles,
  UserCircle2,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, SectionHeading } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Thumb } from "@/components/dashboard/project/avatar-look-picker";
import { NewProjectButton } from "@/components/dashboard/project/new-project-button";
import { ProjectCard } from "@/components/dashboard/project/project-card";
import { VideoCard, type LibraryVideo } from "@/components/dashboard/video/video-library";
import { listAvatarOptions, listProjects } from "@/lib/projects/service";
import { formatShortDate } from "@/lib/format";
import { videoTitle } from "@/lib/video-display";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Dashboard | YouMimic Portal",
};

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  const fullName = session?.user?.name ?? session?.user?.email ?? "there";
  const firstName = fullName.split(" ")[0] || fullName;
  const { joined } = await searchParams;

  const [enterprise, videoRows, videoCount, inProgressCount, projects, avatars, upcoming, bookingCount] = userId
    ? await Promise.all([
        prisma.enterprise.findFirst({ where: { ownerUserId: userId }, select: { id: true, name: true } }),
        prisma.generatedVideo.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 4,
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
            avatar: { select: { name: true } },
          },
        }),
        prisma.generatedVideo.count({ where: { userId } }),
        prisma.generatedVideo.count({ where: { userId, status: { in: ["PENDING", "PROCESSING"] } } }),
        listProjects(userId),
        listAvatarOptions(userId),
        prisma.booking.findMany({
          where: { userId, requestedDate: { gte: startOfToday() }, status: { not: "cancelled" } },
          orderBy: { requestedDate: "asc" },
          take: 2,
          select: { id: true, requestedDate: true, timeStart: true, timeEnd: true, status: true, capturesCount: true },
        }),
        prisma.booking.count({ where: { userId } }),
      ])
    : [null, [], 0, 0, [], [], [], 0];

  const openProjects = projects.filter((p) => p.status !== "COMPLETED");
  const drafts = openProjects.filter((p) => p.status === "DRAFT").length;
  const readyAvatars = avatars.filter((a) => a.usable);
  const onlyReady = readyAvatars.length === 1 ? readyAvatars[0] : null;
  const createHref = onlyReady ? `/dashboard/avatars/${onlyReady.id}/studio` : "/dashboard/avatars";

  const videos: LibraryVideo[] = videoRows.map((v) => ({
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
  }));

  const isNew = videoCount === 0 && openProjects.length === 0;

  return (
    <div className="space-y-8">
      {joined && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            You&apos;ve joined <strong>{joined}</strong> successfully.
          </p>
        </div>
      )}

      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          enterprise ? (
            <>
              You&apos;re working in <span className="font-medium text-foreground">{enterprise.name}</span>.
            </>
          ) : (
            "Pick up where you left off, or start something new."
          )
        }
        actions={
          <>
            <Button asChild>
              <Link href={createHref}>
                <Video className="h-4 w-4" aria-hidden="true" />
                Create a video
              </Link>
            </Button>
            <NewProjectButton />
          </>
        }
      />

      {/* At a glance */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile href="/dashboard/videos" label="Videos" value={videoCount} />
        <StatTile href="/dashboard/videos" label="Being made" value={inProgressCount} />
        <StatTile href="/dashboard/videos" label="Drafts" value={drafts} />
        <StatTile href="/dashboard/avatars" label="Avatars ready" value={readyAvatars.length} />
      </dl>

      {isNew && (
        <GettingStarted
          hasBooking={bookingCount > 0}
          hasAvatar={readyAvatars.length > 0}
          hasVideo={videoCount > 0}
          createHref={createHref}
        />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          {openProjects.length > 0 && (
            <section aria-labelledby="continue-heading" className="space-y-3">
              <SectionHeading id="continue-heading" title="Continue where you left off" />
              <ul className="grid gap-4 sm:grid-cols-2">
                {openProjects.slice(0, 2).map((p) => (
                  <li key={p.id}>
                    <ProjectCard
                      id={p.id}
                      title={p.title}
                      status={p.status}
                      sceneCount={p.sceneCount}
                      updatedAt={p.updatedAt}
                      thumbnailUrl={p.thumbnailUrl}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="recent-heading" className="space-y-3">
            <SectionHeading
              id="recent-heading"
              title="Recent videos"
              action={
                videoCount > 0 ? (
                  <Link href="/dashboard/videos" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    View all
                  </Link>
                ) : undefined
              }
            />
            {videos.length === 0 ? (
              <EmptyState
                icon={Film}
                title="No videos yet"
                description="Pick an avatar, write a script and generate your first video. It only takes a couple of minutes."
                action={
                  <Button asChild>
                    <Link href={createHref}>Create your first video</Link>
                  </Button>
                }
                compact
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {videos.map((v) => (
                  <li key={v.id}>
                    <VideoCard v={v} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="avatars-heading" className="space-y-3">
            <SectionHeading
              id="avatars-heading"
              title="Your avatars"
              action={
                avatars.length > 0 ? (
                  <Link href="/dashboard/avatars" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    View all
                  </Link>
                ) : undefined
              }
            />
            {avatars.length === 0 ? (
              <EmptyState
                icon={UserCircle2}
                title="No avatars yet"
                description="Avatars are made by our team from a capture session."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/bookings">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Book a capture session
                    </Link>
                  </Button>
                }
                compact
              />
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {avatars.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Thumb src={a.previewUrl} className="h-11 w-11 rounded-lg" iconClass="h-6 w-6" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.usable
                            ? a.looks.length > 1
                              ? `${a.looks.filter((l) => l.ready).length} looks ready`
                              : "Ready"
                            : "Getting ready"}
                        </p>
                      </div>
                      {a.usable && (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/avatars/${a.id}/studio`} aria-label={`Create a video with ${a.name}`}>
                            Create
                          </Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          <section aria-labelledby="bookings-heading" className="space-y-3">
            <SectionHeading
              id="bookings-heading"
              title="Upcoming bookings"
              action={
                <Link href="/dashboard/bookings" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Manage
                </Link>
              }
            />
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">
                  No upcoming capture sessions.{" "}
                  <Link href="/dashboard/bookings" className="font-medium text-primary underline-offset-4 hover:underline">
                    Book one
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y p-0">
                  {upcoming.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{formatShortDate(b.requestedDate)}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.timeStart} to {b.timeEnd} · {b.capturesCount} {b.capturesCount === 1 ? "capture" : "captures"}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                        {b.status}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        </aside>
      </div>

      <MoreTools />
    </div>
  );
}

function StatTile({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
    </Link>
  );
}

function GettingStarted({
  hasBooking,
  hasAvatar,
  hasVideo,
  createHref,
}: {
  hasBooking: boolean;
  hasAvatar: boolean;
  hasVideo: boolean;
  createHref: string;
}) {
  const steps = [
    {
      done: hasBooking || hasAvatar,
      title: "Book a capture session",
      text: "We record the footage your avatar is made from.",
      href: "/dashboard/bookings",
      cta: "View bookings",
    },
    {
      done: hasAvatar,
      title: "Get your avatar ready",
      text: "Once we've built it, it shows up under Avatars.",
      href: "/dashboard/avatars",
      cta: "View avatars",
    },
    {
      done: hasVideo,
      title: "Create your first video",
      text: "Write a script, pick a voice and generate.",
      href: createHref,
      cta: "Create a video",
    },
  ];
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <section aria-labelledby="getting-started-heading" className="space-y-3">
      <SectionHeading id="getting-started-heading" title="Getting started" />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn(
              "rounded-xl bg-card p-4 ring-1",
              i === nextIndex ? "ring-2 ring-primary" : "ring-foreground/10",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {step.done ? <Check className="h-3.5 w-3.5" aria-label="Done" /> : i + 1}
              </span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            <Link
              href={step.href}
              className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {step.cta}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TOOLS = [
  { icon: Video, title: "Video Studio", text: "Open the full video studio in a new tab.", href: "https://app.heygen.com" },
  { icon: Bot, title: "Interactive Avatar", text: "Launch the interactive avatar experience.", href: "https://app.liveavatar.com/home" },
  { icon: Presentation, title: "PPT to Video", text: "Turn presentations into video.", href: "https://app.heygen.com/ppt-to-video" },
  { icon: Languages, title: "Translate", text: "Open the video translation tool.", href: "https://app.heygen.com/video-translate" },
];

function MoreTools() {
  return (
    <section aria-labelledby="tools-heading" className="space-y-3">
      <SectionHeading id="tools-heading" title="More tools" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map(({ icon: Icon, title, text, href }) => (
          <li key={title}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {title}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
            </a>
          </li>
        ))}
        <li>
          <a
            href="https://vimeo.com/1202651661/1f14b9b8a7?fl=ip&fe=ec"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                Hologram
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Coming soon</span>
                <span className="sr-only">(opens in a new tab)</span>
              </span>
              <span className="block text-xs text-muted-foreground">Watch the sneak peek while we get this ready.</span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  );
}
