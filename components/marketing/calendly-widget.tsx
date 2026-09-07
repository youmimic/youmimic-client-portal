"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (options: {
        url: string;
        parentElement: HTMLElement;
        prefill?: Record<string, unknown>;
        utm?: Record<string, unknown>;
      }) => void;
    };
  }
}

const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";

let calendlyScriptPromise: Promise<void> | null = null;

function loadCalendlyScript(): Promise<void> {
  if (window.Calendly) return Promise.resolve();
  if (!calendlyScriptPromise) {
    calendlyScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${CALENDLY_SCRIPT_SRC}"]`,
      );
      if (existing) {
        if (window.Calendly) {
          resolve();
        } else {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Calendly script failed to load")));
        }
        return;
      }
      const script = document.createElement("script");
      script.src = CALENDLY_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Calendly script failed to load"));
      document.body.appendChild(script);
    });
  }
  return calendlyScriptPromise;
}

// Calendly's widget.js only scans the page for `.calendly-inline-widget`
// elements once, at the moment it first loads, and drops an iframe into
// whatever matching elements exist right then. That works on a full page
// load (the widget div is already in the DOM before the script runs), but
// breaks on a client-side route change to a page that's mounting the
// widget div for the first time in this session — the script is already
// loaded (Next's <Script> de-dupes by src) and never re-scans, so the
// container stays empty until a hard refresh. Explicitly calling
// initInlineWidget ourselves on every mount sidesteps the one-time
// auto-scan entirely.
export function CalendlyInlineWidget({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadCalendlyScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.Calendly) return;
        containerRef.current.innerHTML = "";
        window.Calendly.initInlineWidget({
          url,
          parentElement: containerRef.current,
        });
      })
      .catch(() => {
        // Left empty — a failed load just leaves the container blank
        // rather than throwing inside a rendered page.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return <div ref={containerRef} className={className} />;
}
