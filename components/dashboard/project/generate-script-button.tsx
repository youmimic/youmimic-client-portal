"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Opens a small dialog asking what the scene should be about, calls the AI
// script endpoint, and shows the draft before applying it — never replaces
// an existing script silently, since generation can fail or miss the mark
// and the person may already have written content worth keeping.
export function GenerateScriptButton({
  disabled,
  onGenerated,
}: {
  disabled?: boolean;
  onGenerated: (script: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTopic("");
    setDraft(null);
    setError(null);
  }

  async function handleGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/dashboard/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        return;
      }
      setDraft(json.script);
    } catch {
      setError("Couldn't reach the script generator. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleUse() {
    if (!draft) return;
    onGenerated(draft);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => setOpen(true)}>
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        Generate with AI
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a script with AI</DialogTitle>
          <DialogDescription>
            Describe what this scene should be about, and a draft script will be written for you to review before
            using it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="ai-script-topic">What should this scene be about?</Label>
          <Textarea
            id="ai-script-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="e.g. Introducing our new small business pricing plan"
            disabled={loading}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {draft && (
          <div className="space-y-1.5">
            <Label htmlFor="ai-script-draft">Draft</Label>
            <Textarea id="ai-script-draft" value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} />
          </div>
        )}

        <DialogFooter>
          {draft ? (
            <>
              <Button type="button" variant="outline" onClick={handleGenerate} disabled={loading || !topic.trim()}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Try again
              </Button>
              <Button type="button" onClick={handleUse}>
                Use this script
              </Button>
            </>
          ) : (
            <Button type="button" onClick={handleGenerate} disabled={loading || !topic.trim()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
