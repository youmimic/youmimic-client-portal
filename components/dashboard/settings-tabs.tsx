"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/settings", label: "Account", exact: true },
  { href: "/dashboard/settings/usage", label: "Usage", exact: false },
];

// Link-based tabs so each section has its own address and works without
// client-side state (back button, sharing a link, opening in a new tab).
export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="border-b">
      <ul className="-mb-px flex gap-1" role="list">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
