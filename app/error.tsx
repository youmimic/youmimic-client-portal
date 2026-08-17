"use client";

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ServerCrash } from "lucide-react";
import { SiteLogo } from "@/components/branding/site-logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Button } from "@/components/ui/button";
import { HEADER_HEIGHT } from "@/components/marketing/marketing-header-config";
import { cn } from "@/lib/utils";

// Root error.tsx — catches any runtime error thrown by a page or layout
// below the root layout that doesn't have its own more specific error
// boundary. Must be a Client Component (Next.js requirement), which rules
// out reusing the real MarketingHeader — it's an async Server Component
// that reads the session via auth(), and async Server Components can't be
// imported into a "use client" file. This renders a simplified, static
// header instead (logo + theme toggle, no session-aware nav) — reasonable
// for an error state where a full nav isn't the priority anyway.
// (global-error.tsx is the last-resort sibling to this: it only fires for
// errors in the root layout itself, which this can't catch.)
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div
          className={cn(
            "mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6",
            HEADER_HEIGHT,
          )}
        >
          <SiteLogo
            forceVariant="auto"
            className="flex items-center h-6 w-auto sm:h-7 md:h-8"
          />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <ServerCrash
          className="mb-6 h-20 w-20 text-accent"
          strokeWidth={1.25}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-accent">Error</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
          An unexpected error occurred. Our team has been notified — please
          try again, or head back home.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
