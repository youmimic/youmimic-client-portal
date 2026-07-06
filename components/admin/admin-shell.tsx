"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteLogo } from "@/components/branding/site-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import SignOutButton from "@/components/auth/sign-out-button";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users, exact: false },
  { href: "/admin/enterprises", label: "Enterprises", icon: Building2, exact: false },
];

type SidebarContentProps = {
  userName?: string | null;
  adminRole?: string | null;
  onMobileClose: () => void;
};

function SidebarContent({ userName, adminRole, onMobileClose }: SidebarContentProps) {
  const pathname = usePathname();
  const initial = (userName || "A").charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <SiteLogo
          href="/admin"
          onClick={onMobileClose}
          className="flex items-center"
          forceVariant="auto"
        />
        <span className="ml-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
          Admin
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1" role="list">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Back to Dashboard
        </Link>

        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive text-sm font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            {userName && (
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {userName}
              </p>
            )}
            {adminRole && (
              <p className="truncate text-xs text-sidebar-foreground/70">
                {adminRole.replace(/_/g, " ")}
              </p>
            )}
          </div>
        </div>

        <SignOutButton />
      </div>
    </div>
  );
}

type AdminShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
    adminRole?: string | null;
  };
  children: React.ReactNode;
};

export function AdminShell({ user, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent
          userName={user.name}
          adminRole={user.adminRole}
          onMobileClose={() => {}}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
          className="absolute right-3 top-3 rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <SidebarContent
          userName={user.name}
          adminRole={user.adminRole}
          onMobileClose={() => setMobileOpen(false)}
        />
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Mobile: logo + badge */}
          <SiteLogo className="flex items-center md:hidden" forceVariant="auto" />
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive md:hidden">
            Admin
          </span>

          {/* Desktop: area label */}
          <div className="hidden md:flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm font-medium text-muted-foreground">Admin Area</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
