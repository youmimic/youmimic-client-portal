"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  IMPORT_DOCUMENT_ACCEPT,
  importDocumentProblem,
  setPendingDocumentImport,
} from "@/lib/projects/pending-import";

// Pick a PDF or PowerPoint, then start a new draft project and open it with
// the file waiting in the editor's usual import dialog (Slide or Avatar, add
// or replace). The picker opens first because browsers only allow it from a
// click, and checking the file first means a wrong one never creates a draft.
export function ImportDocumentButton({
  variant = "outline",
  label = "PDF or PowerPoint to video",
}: {
  variant?: "default" | "outline" | "ghost";
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    const problem = importDocumentProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as { projectId?: string; error?: string };
      if (res.status === 201 && json.projectId) {
        setPendingDocumentImport(json.projectId, file);
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
      <Button type="button" variant={variant} disabled={loading} onClick={() => inputRef.current?.click()}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <FileUp className="h-4 w-4" aria-hidden="true" />
        )}
        {loading ? "Starting..." : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void start(file);
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
