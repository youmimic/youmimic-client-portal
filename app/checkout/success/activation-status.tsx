"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

type DraftStatus = "CREATED" | "OPEN" | "COMPLETED" | "EXPIRED" | "FAILED" | "pending";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // ~1 minute before giving up and showing recovery copy

// This page is UX only, per the spec — it never grants access itself. It
// just asks the server "has the webhook finished yet?" on a timer and shows
// the result; actual account/subscription state is set exclusively by
// app/api/stripe/webhook/route.ts.
export function ActivationStatus({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<DraftStatus>("pending");
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED" || status === "EXPIRED") return;
    if (pollCount >= MAX_POLLS) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/checkout-draft/status?session_id=${encodeURIComponent(sessionId)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (typeof data.status === "string") {
          setStatus(data.status as DraftStatus);
        }
      } catch {
        // Transient network error — just try again on the next tick.
      }
      setPollCount((n) => n + 1);
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [status, pollCount, sessionId]);

  if (status === "COMPLETED") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-10 text-accent" />
        <h1 className="text-xl font-semibold">You&apos;re all set</h1>
        <p className="text-muted-foreground">
          Check your email for a link to set up your account and access your workspace.
        </p>
      </div>
    );
  }

  if (status === "FAILED" || status === "EXPIRED") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <h1 className="text-xl font-semibold">We couldn&apos;t confirm your setup</h1>
        <p className="text-muted-foreground">
          Your payment may still have gone through — check your email, or contact support with
          your receipt if you don&apos;t hear from us shortly.
        </p>
        <Link href="/contact" className="text-sm font-medium underline underline-offset-4">
          Contact support
        </Link>
      </div>
    );
  }

  if (pollCount >= MAX_POLLS) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-10 animate-spin text-muted-foreground" />
        <h1 className="text-xl font-semibold">Still setting things up</h1>
        <p className="text-muted-foreground">
          This is taking longer than usual. You&apos;ll receive an email as soon as your workspace
          is ready — refresh this page anytime to check again.
        </p>
        <Link href="/contact" className="text-sm font-medium underline underline-offset-4">
          Contact support
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Loader2 className="size-10 animate-spin text-muted-foreground" />
      <h1 className="text-xl font-semibold">Payment received</h1>
      <p className="text-muted-foreground">We&apos;re setting up your workspace now.</p>
    </div>
  );
}
