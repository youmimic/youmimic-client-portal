"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@youmimic.com";

export type BillingAction =
  | { type: "checkout"; planType: "CREATOR" | "ENTERPRISE"; enterpriseId?: string }
  | { type: "portal"; enterpriseId?: string }
  | { type: "managed" }; // enterprise billing is handled by the YouMimic team

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

  if (action.type === "managed") {
    return (
      <p className="text-sm text-muted-foreground">
        Enterprise billing is managed by the YouMimic team.{" "}
        <a
          href={`mailto:${SALES_EMAIL}`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          Contact sales
        </a>{" "}
        to update your plan.
      </p>
    );
  }

  async function handleClick() {
    if (action.type === "managed") return;
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
