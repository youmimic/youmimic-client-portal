"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

const SALES_EMAIL = "sales@youmimic.com";

export function BillingSupportEmail() {
  const [copied, setCopied] = useState(false);

  function copyEmail() {
    navigator.clipboard.writeText(SALES_EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <p className="text-sm text-muted-foreground">
      Update or cancel your plan? Reach us at{" "}
      <span className="inline-flex items-center gap-1">
        <a
          href={`mailto:${SALES_EMAIL}`}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {SALES_EMAIL}
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Copy sales email"
          onClick={copyEmail}
        >
          {copied ? (
            <Check
              className="text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </span>
    </p>
  );
}
