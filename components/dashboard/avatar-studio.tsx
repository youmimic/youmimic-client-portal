"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GeneratedVideoRow as VideoRow,
  type GeneratedVideoData,
} from "@/components/dashboard/generated-video-row";

const SCRIPT_MAX = 5000;

type ActionState = { loading: boolean; error: string | null };
const idle: ActionState = { loading: false, error: null };

export type AvatarLookOption = {
  id: string;
  name: string;
  status: string;
  previewUrl: string | null;
  videoUrl: string | null;
};

function LookThumbnail({ previewUrl, name }: { previewUrl: string | null; name: string }) {
  if (previewUrl) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        <Image src={previewUrl} alt={name} fill unoptimized className="object-cover" sizes="120px" />
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted">
      <UserCircle2 className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
    </div>
  );
}

function LookPicker({
  looks,
  selectedLookId,
  onSelect,
}: {
  looks: AvatarLookOption[];
  selectedLookId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Choose a look</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {looks.map((look) => {
          const ready = look.status === "ready";
          const selected = look.id === selectedLookId;
          return (
            <button
              key={look.id}
              type="button"
              disabled={!ready}
              onClick={() => onSelect(look.id)}
              className={`space-y-1 rounded-md border p-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50"
              }`}
            >
              <LookThumbnail previewUrl={look.previewUrl} name={look.name} />
              <p className="truncate px-0.5 text-[11px] text-muted-foreground">
                {ready ? look.name : `${look.name} (not ready)`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AvatarStudio({
  avatarId,
  looks,
  videos,
}: {
  avatarId: string;
  looks: AvatarLookOption[];
  videos: GeneratedVideoData[];
}) {
  const router = useRouter();
  const [script, setScript] = useState("");
  const firstReadyLook = looks.find((l) => l.status === "ready") ?? null;
  const [selectedLookId, setSelectedLookId] = useState<string | null>(firstReadyLook?.id ?? null);
  const [state, setState] = useState<ActionState>(idle);
  const selectedLook = looks.find((l) => l.id === selectedLookId) ?? null;

  async function handleGenerate() {
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/dashboard/avatars/${avatarId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, ...(selectedLookId ? { avatarLookId: selectedLookId } : {}) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setScript("");
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const canGenerate = state.loading === false && script.trim().length > 0 && (looks.length === 0 || !!selectedLookId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {looks.length > 0 && (
            <LookPicker looks={looks} selectedLookId={selectedLookId} onSelect={setSelectedLookId} />
          )}
          {selectedLook?.videoUrl && (
            <video
              key={selectedLook.id}
              controls
              preload="none"
              poster={selectedLook.previewUrl ?? undefined}
              className="w-full max-w-xs rounded-md border"
            >
              <source src={selectedLook.videoUrl} type="video/mp4" />
            </video>
          )}
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Write what you want the avatar to say…"
            rows={6}
            maxLength={SCRIPT_MAX}
          />
          <p className="text-xs text-muted-foreground text-right">
            {script.length}/{SCRIPT_MAX}
          </p>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button disabled={!canGenerate} onClick={handleGenerate}>
            {state.loading ? "Starting…" : "Generate video"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your videos</CardTitle>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos generated yet.</p>
          ) : (
            videos.map((v) => <VideoRow key={v.id} video={v} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
