"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

type SubscribeResponse = { ok: boolean; error?: string };

// Brevo ("Sendinblue") newsletter signup, submitted through our own
// /api/newsletter/subscribe proxy (see that route for why) instead of
// posting straight to Brevo's form endpoint — a native form POST there
// navigates the whole page to Brevo's own response, which is raw JSON, not
// a page a visitor should ever land on. Styled explicitly for a dark
// backdrop (not theme tokens) since this form's only usage is inside the
// footer, which is now permanently dark regardless of site theme.
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
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2 text-sm"
        style={{ color: "#FFFFFF" }}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>Subscription successful</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor="EMAIL"
        className="mb-3 block text-sm font-semibold"
        style={{ color: "#FFFFFF" }}
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
          className="h-10 w-full rounded-md px-3 text-sm placeholder:text-white/50 focus:outline-none focus:ring-3 focus:ring-ring/50 disabled:opacity-60"
          style={{
            border: "1px solid rgba(255,255,255,0.25)",
            backgroundColor: "rgba(255,255,255,0.08)",
            color: "#FFFFFF",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="relative isolate h-10 w-full overflow-hidden rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-black/10 before:transition-transform before:duration-500 before:ease-out hover:bg-primary/80 hover:before:scale-x-100 disabled:opacity-60 motion-reduce:before:transition-none dark:before:bg-white/10"
        >
          {status === "submitting" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {status === "error" && error && (
        <p role="alert" aria-live="polite" className="mt-2 text-xs" style={{ color: "#FCA5A5" }}>
          {error}
        </p>
      )}
    </form>
  );
}
