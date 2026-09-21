"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Play, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AvatarOption } from "@/lib/projects/rules";
import { cn } from "@/lib/utils";

export function Thumb({
  src,
  alt = "",
  className,
  iconClass = "h-5 w-5",
}: {
  src: string | null;
  alt?: string;
  className?: string;
  iconClass?: string;
}) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-muted", className)}>
      {src ? (
        <Image src={src} alt={alt} fill unoptimized className="object-cover" sizes="96px" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <UserCircle2 className={cn("text-muted-foreground/40", iconClass)} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

// Picks who speaks in a scene. Avatars are shown as cards with their own
// thumbnail, and every look of the chosen avatar is shown as a thumbnail too,
// so people choose by seeing rather than by reading names. Every scene has
// its own avatar, so there is no "inherit" option here.
export function AvatarLookPicker({
  avatars,
  avatarId,
  lookId,
  disabled,
  onChange,
}: {
  avatars: AvatarOption[];
  avatarId: string | null;
  lookId: string | null;
  disabled: boolean;
  onChange: (avatarId: string, lookId: string | null) => void;
}) {
  const [introOpen, setIntroOpen] = useState(false);
  const selected = avatars.find((a) => a.id === avatarId) ?? null;
  // With no look stored yet, the first ready look is what will be used.
  const activeLookId = lookId ?? selected?.looks.find((l) => l.ready)?.id ?? null;
  const activeLook = selected?.looks.find((l) => l.id === activeLookId) ?? null;

  if (avatars.length === 0) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        You don&apos;t have any avatars yet. Once your avatar has been set up, you can pick it here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium" id="scene-avatar-label">
          Avatar
        </p>
        <div
          role="group"
          aria-labelledby="scene-avatar-label"
          className={cn("grid gap-2", avatars.length === 1 ? "grid-cols-1" : "grid-cols-2")}
        >
          {avatars.map((a) => {
            const isSelected = a.id === avatarId;
            return (
              <button
                key={a.id}
                type="button"
                disabled={disabled || !a.usable}
                aria-pressed={isSelected}
                onClick={() => {
                  setIntroOpen(false);
                  onChange(a.id, a.looks.find((l) => l.ready)?.id ?? null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
                  isSelected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                )}
              >
                <Thumb src={a.previewUrl} className="h-11 w-11 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {!a.usable
                      ? "Not ready"
                      : a.looks.length === 0
                        ? "Single look"
                        : `${a.looks.filter((l) => l.ready).length} ${a.looks.filter((l) => l.ready).length === 1 ? "look" : "looks"}`}
                  </span>
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {selected && selected.looks.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium" id="scene-look-label">
            Look
          </p>
          <div role="group" aria-labelledby="scene-look-label" className="grid grid-cols-3 gap-2">
            {selected.looks.map((look) => {
              const isSelected = look.id === activeLookId;
              return (
                <button
                  key={look.id}
                  type="button"
                  disabled={disabled || !look.ready}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setIntroOpen(false);
                    onChange(selected.id, look.id);
                  }}
                  className={cn(
                    "space-y-1 rounded-lg border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                    isSelected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                    !look.ready && "opacity-50",
                  )}
                >
                  <span className="relative block">
                    <Thumb src={look.previewUrl} className="aspect-square w-full rounded-md" iconClass="h-7 w-7" />
                    {isSelected && (
                      <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="block truncate px-0.5 text-[11px] text-muted-foreground">
                    {look.ready ? look.name : `${look.name} (not ready)`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeLook?.videoUrl &&
        (introOpen ? (
          <div className="space-y-2">
            <video
              key={activeLook.id}
              controls
              autoPlay
              playsInline
              poster={activeLook.previewUrl ?? undefined}
              aria-label={`${activeLook.name} intro clip`}
              className="w-full max-w-xs rounded-md border"
            >
              <source src={activeLook.videoUrl} type="video/mp4" />
            </video>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIntroOpen(false)}>
              Hide preview
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setIntroOpen(true)}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Watch {activeLook.name} intro
          </Button>
        ))}
    </div>
  );
}
