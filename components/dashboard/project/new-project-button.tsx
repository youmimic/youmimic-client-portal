"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Creates a draft multi-scene project (with one blank scene) and opens it.
export function NewProjectButton({
  avatarId,
  variant = "outline",
  label = "New multi-scene video",
}: {
  avatarId?: string;
  variant?: "default" | "outline" | "ghost";
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(avatarId ? { avatarId } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { projectId?: string; error?: string };
      if (res.status === 201 && json.projectId) {
        router.push(`/dashboard/videos/projects/${json.projectId}`);
        return;
      }
      setError(json.error ?? `We couldn't start a new project (${res.status}).`);
      setLoading(false);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={variant} disabled={loading} onClick={() => void create()}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Layers className="h-4 w-4" aria-hidden="true" />
        )}
        {loading ? "Starting..." : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
