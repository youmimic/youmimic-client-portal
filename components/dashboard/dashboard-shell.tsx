"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { DashboardHeader } from "./dashboard-header";

type DashboardShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
  };
  enterprise: { name: string; role: string } | null;
  children: React.ReactNode;
};

export const MOBILE_SIDEBAR_ID = "dashboard-mobile-sidebar";

export function DashboardShell({ user, enterprise, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Close the mobile sidebar on any route change — covers back/forward and
  // programmatic navigation, not just a direct click on a rendered Link.
  // Adjusting state during render (React's documented pattern for "reset
  // state when a prop changes") rather than in an effect, since an
  // unconditional setState in an effect body triggers an extra render every
  // time regardless of whether anything actually changed. Mirrors
  // components/marketing/marketing-nav.tsx's identical fix for the same
  // class of bug.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  // While the mobile sidebar is open: lock body scroll and let Escape close
  // it, returning focus to the toggle button that opened it.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        toggleButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <AppSidebar
        userName={user.name}
        userEmail={user.email}
        enterprise={enterprise}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader
          mobileOpen={mobileOpen}
          onMobileMenuToggle={() => setMobileOpen((v) => !v)}
          toggleButtonRef={toggleButtonRef}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <div className="container mx-auto p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
