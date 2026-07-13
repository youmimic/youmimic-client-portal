"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type BookingNoteRow = {
  id: string;
  note: string;
  createdAt: string;
  adminUser: { id: string; name: string; email: string };
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BookingNotesSection({
  bookingId,
  notes,
  canManage,
}: {
  bookingId: string;
  notes: BookingNoteRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No internal notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {n.adminUser.name ?? n.adminUser.email} · {formatTimestamp(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={handleSubmit} className="space-y-2 border-t pt-4">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add an internal note for other admins (not visible to the customer)…"
            maxLength={2000}
            rows={3}
            disabled={loading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={loading || note.trim().length === 0}
            >
              {loading ? "Adding…" : "Add note"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
