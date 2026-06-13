"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type DashboardHeaderProps = {
  onMobileMenuToggle: () => void;
};

export function DashboardHeader({ onMobileMenuToggle }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMobileMenuToggle}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <span className="font-semibold text-foreground md:hidden">YouMimic</span>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
