"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import SignOutButton from "@/components/auth/sign-out-button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays, exact: false },
  { href: "/dashboard/avatars", label: "Avatars", icon: UserCircle2, exact: false },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

type AppSidebarProps = {
  userName?: string | null;
  userEmail?: string | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

function SidebarContent({
  userName,
  userEmail,
  onMobileClose,
}: Pick<AppSidebarProps, "userName" | "userEmail" | "onMobileClose">) {
  const pathname = usePathname();
  const initial = (userName || userEmail || "U").charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Link
          href="/dashboard"
          onClick={onMobileClose}
          className="font-semibold text-sidebar-foreground hover:opacity-80 transition-opacity"
        >
          YouMimic
        </Link>
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
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            {userName && (
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {userName}
              </p>
            )}
            {userEmail && (
              <p className="truncate text-xs text-sidebar-foreground/70">
                {userEmail}
              </p>
            )}
          </div>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}

export function AppSidebar({
  userName,
  userEmail,
  mobileOpen,
  onMobileClose,
}: AppSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent
          userName={userName}
          userEmail={userEmail}
          onMobileClose={onMobileClose}
        />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
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
          onClick={onMobileClose}
          aria-label="Close sidebar"
          className="absolute right-3 top-3 rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <SidebarContent
          userName={userName}
          userEmail={userEmail}
          onMobileClose={onMobileClose}
        />
      </aside>
    </>
  );
}
