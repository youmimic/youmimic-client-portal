"use client";

import type { RefObject } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SiteLogo } from "@/components/branding/site-logo";
import { MOBILE_SIDEBAR_ID } from "./dashboard-shell";

type DashboardHeaderProps = {
  mobileOpen: boolean;
  onMobileMenuToggle: () => void;
  toggleButtonRef: RefObject<HTMLButtonElement | null>;
};

export function DashboardHeader({
  mobileOpen,
  onMobileMenuToggle,
  toggleButtonRef,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        ref={toggleButtonRef}
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMobileMenuToggle}
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={mobileOpen}
        aria-controls={MOBILE_SIDEBAR_ID}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <SiteLogo className="flex items-center md:hidden" forceVariant="auto" />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
