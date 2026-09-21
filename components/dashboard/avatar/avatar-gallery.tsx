"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Clock, Play, Search, TriangleAlert, UserCircle2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type GalleryLook = {
  id: string;
  name: string;
  status: string;
  previewUrl: string | null;
  videoUrl: string | null;
};

export type GalleryAvatar = {
  id: string;
  name: string;
  enterpriseName: string | null;
  createdAt: string;
  // Rolled-up display values, already resolved on the server.
  status: string;
  previewUrl: string | null;
  introVideoUrl: string | null;
  usable: boolean;
  looks: GalleryLook[];
  videoCount: number;
};

type Filter = "ALL" | "READY" | "PREPARING";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "READY", label: "Ready" },
  { value: "PREPARING", label: "Getting ready" },
];

type StatusView = { label: string; hint: string; tone: "ok" | "wait" | "warn" | "bad" };

function statusView(status: string, usable: boolean): StatusView {
  const s = status.toLowerCase();
  if (usable) return { label: "Ready", hint: "", tone: "ok" };
  if (s === "pending_consent") {
    return {
      label: "Awaiting consent",
      hint: "This avatar is waiting for consent to be recorded before it can be used.",
      tone: "warn",
    };
  }
  if (s === "failed" || s === "error") {
    return { label: "Needs attention", hint: "Something went wrong with this avatar. Please contact support.", tone: "bad" };
  }
  return {
    label: "Getting ready",
    hint: "We're preparing this avatar. You can create videos as soon as it's done.",
    tone: "wait",
  };
}

const TONE_CLASS: Record<StatusView["tone"], string> = {
  ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  wait: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function StatusPill({ view }: { view: StatusView }) {
  const Icon = view.tone === "ok" ? Check : view.tone === "wait" ? Clock : TriangleAlert;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm",
        TONE_CLASS[view.tone],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {view.label}
    </span>
  );
}

function AvatarCard({ avatar }: { avatar: GalleryAvatar }) {
  // Which clip is playing in the media area: the avatar's main intro or one
  // look's own clip. null shows the still preview.
  const [playing, setPlaying] = useState<{ url: string; label: string } | null>(null);
  const view = statusView(avatar.status, avatar.usable);
  const readyLooks = avatar.looks.filter((l) => l.status === "ready").length;

  return (
    <Card className="flex h-full flex-col overflow-hidden pt-0">
      <div className="relative aspect-video w-full bg-muted">
        {playing ? (
          <>
            <video
              key={playing.url}
              controls
              autoPlay
              playsInline
              poster={avatar.previewUrl ?? undefined}
              className="h-full w-full object-cover"
              aria-label={playing.label}
            >
              <source src={playing.url} type="video/mp4" />
            </video>
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Close
            </button>
          </>
        ) : (
          <>
            {avatar.previewUrl ? (
              <Image
                src={avatar.previewUrl}
                alt={`${avatar.name} preview`}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserCircle2 className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
              </div>
            )}
            <div className="absolute left-2 top-2">
              <StatusPill view={view} />
            </div>
            {avatar.introVideoUrl && (
              <button
                type="button"
                onClick={() => setPlaying({ url: avatar.introVideoUrl as string, label: `${avatar.name} intro clip` })}
                aria-label={`Play intro clip for ${avatar.name}`}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                Watch intro
              </button>
            )}
          </>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        <div>
          <h2 className="text-base font-semibold leading-snug">{avatar.name}</h2>
          <p className="text-xs text-muted-foreground">
            {avatar.enterpriseName ? `${avatar.enterpriseName} · ` : ""}
            {avatar.looks.length > 0
              ? `${readyLooks} of ${avatar.looks.length} ${avatar.looks.length === 1 ? "look" : "looks"} ready`
              : "Single look"}
          </p>
        </div>

        {avatar.looks.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Tap a look to watch its intro</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={`Looks for ${avatar.name}`}>
              {avatar.looks.map((look) => {
                const canPlay = look.videoUrl !== null;
                const active = playing?.url === look.videoUrl;
                return (
                  <li key={look.id}>
                    <button
                      type="button"
                      disabled={!canPlay}
                      aria-label={canPlay ? `Play intro for ${look.name}` : `${look.name} has no intro clip`}
                      title={
                        canPlay
                          ? look.name
                          : look.status === "ready"
                            ? `${look.name} (no intro clip)`
                            : `${look.name} (not ready)`
                      }
                      onClick={() =>
                        look.videoUrl && setPlaying({ url: look.videoUrl, label: `${look.name} intro clip` })
                      }
                      className={cn(
                        "group/look relative block h-10 w-10 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        canPlay ? "hover:ring-primary/60" : "cursor-not-allowed opacity-40",
                        look.status !== "ready" && "opacity-40",
                        active && "ring-2 ring-primary",
                      )}
                    >
                      {look.previewUrl ? (
                        <Image src={look.previewUrl} alt="" fill unoptimized className="object-cover" sizes="40px" />
                      ) : (
                        <UserCircle2 className="m-auto h-full w-5 text-muted-foreground/40" aria-hidden="true" />
                      )}
                      {canPlay && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/look:opacity-100 group-focus-visible/look:opacity-100">
                          <Play className="h-4 w-4 text-white" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {avatar.videoCount === 0 ? (
            "No videos yet"
          ) : (
            <Link href="/dashboard/videos" className="hover:text-primary hover:underline">
              {avatar.videoCount} {avatar.videoCount === 1 ? "video" : "videos"} created
            </Link>
          )}
        </p>

        <div className="mt-auto pt-1">
          {avatar.usable ? (
            <Button asChild className="w-full">
              <Link href={`/dashboard/avatars/${avatar.id}/studio`}>
                <Video className="h-4 w-4" aria-hidden="true" />
                Create video
              </Link>
            </Button>
          ) : (
            <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">{view.hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AvatarGallery({ avatars }: { avatars: GalleryAvatar[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(
    () => ({
      ALL: avatars.length,
      READY: avatars.filter((a) => a.usable).length,
      PREPARING: avatars.filter((a) => !a.usable).length,
    }),
    [avatars],
  );

  const q = query.trim().toLowerCase();
  const visible = avatars.filter((a) => {
    if (filter === "READY" && !a.usable) return false;
    if (filter === "PREPARING" && a.usable) return false;
    if (!q) return true;
    return `${a.name} ${a.enterpriseName ?? ""}`.toLowerCase().includes(q);
  });

  const showControls = avatars.length > 3;

  return (
    <div className="space-y-4">
      {showControls && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search avatars"
              aria-label="Search avatars"
              className="pl-8"
            />
          </div>
          <div role="group" aria-label="Filter avatars by status" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  filter === f.value
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {f.label} <span className="text-xs">({counts[f.value]})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <UserCircle2 className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No avatars match your search.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("ALL");
              }}
            >
              Clear search and filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((avatar) => (
            <li key={avatar.id}>
              <AvatarCard avatar={avatar} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
