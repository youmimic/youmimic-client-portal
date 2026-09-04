"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

type SubscribeResponse = { ok: boolean; error?: string };

// Brevo ("Sendinblue") newsletter signup, submitted through our own
// /api/newsletter/subscribe proxy (see that route for why) instead of
// posting straight to Brevo's form endpoint — a native form POST there
// navigates the whole page to Brevo's own response, which is raw JSON, not
// a page a visitor should ever land on. Restyled to match this site's own
// typography/palette rather than Brevo's default embed CSS.
export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: SubscribeResponse = await res
        .json()
        .catch(() => ({ ok: false }));

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Subscription failed. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-start gap-2 text-sm text-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>Subscription successful</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor="EMAIL"
        className="mb-3 block text-sm font-semibold text-foreground"
      >
        Subscribe to our newsletter from Neil, the CEO
      </label>
      {/* Stacked, not side-by-side — this lives in a single narrow footer
          column (alongside Social), not a full-width block, so an inline
          input+button would be cramped. */}
      <div className="flex flex-col gap-2">
        <input
          type="email"
          id="EMAIL"
          name="EMAIL"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-10 w-full rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-60"
        >
          {status === "submitting" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {status === "error" && error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </form>
  );
}
