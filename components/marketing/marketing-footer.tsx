import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <span>© 2026 YouMimic. All rights reserved.</span>
        <div className="flex gap-6">
          <Link
            href="/login"
            className="transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="transition-colors hover:text-foreground"
          >
            Get started
          </Link>
        </div>
      </div>
    </footer>
  );
}
