"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

export type BillingAction =
  | { type: "checkout"; planType: "CREATOR" | "ENTERPRISE"; enterpriseId?: string }
  | { type: "portal"; enterpriseId?: string };

export function BillingActionButton({
  action,
  label,
  variant = "default",
}: {
  action: BillingAction;
  label: string;
  variant?: ButtonProps["variant"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    try {
      const endpoint =
        action.type === "checkout"
          ? "/api/stripe/checkout-session"
          : "/api/stripe/customer-portal";

      const body =
        action.type === "checkout"
          ? {
              planType: action.planType,
              ...(action.enterpriseId && { enterpriseId: action.enterpriseId }),
            }
          : {
              ...(action.enterpriseId && { enterpriseId: action.enterpriseId }),
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }

      if (data.url) {
        // Don't clear busy — page is navigating away
        window.location.href = data.url;
      } else {
        setError("No redirect URL received.");
        setBusy(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant={variant} disabled={busy} onClick={handleClick}>
        {busy ? "Redirecting…" : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
