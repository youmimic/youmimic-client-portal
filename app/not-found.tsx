import Link from "next/link";
import { SearchX } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Button } from "@/components/ui/button";

// Root not-found.tsx catches any URL that doesn't match a route anywhere in
// the app (typos, dead links, removed pages) — a nested not-found.tsx would
// only fire for unmatched sub-paths within its own route group. Uses the
// marketing chrome as the universal shell since a 404 can be hit by a
// logged-out visitor just as easily as a signed-in user; MarketingHeader is
// already session-aware (shows "Dashboard" vs "Sign in") so this doesn't
// need to duplicate that logic.
export default function NotFound() {
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <SearchX
          className="mb-6 h-20 w-20 text-accent"
          strokeWidth={1.25}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-accent">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have
          moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
