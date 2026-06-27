"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEADER_OFFSET } from "@/components/marketing/marketing-header-config";

const navLinks = [
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* ── Desktop nav (sm+) — unchanged ────────────────────────────── */}
      <nav className="hidden items-center gap-6 sm:flex">
        {navLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-sm font-medium transition-colors hover:text-foreground",
              pathname === href ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* ── Mobile hamburger toggle (< sm) ───────────────────────────── */}
      <button
        type="button"
        className="flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground sm:hidden"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* ── Mobile dropdown panel (< sm) ─────────────────────────────── */}
      {isOpen && (
        <>
          {/* Backdrop — closes menu on outside tap */}
          <div
            className={cn("fixed inset-0 z-30 sm:hidden", HEADER_OFFSET)}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          {/* Nav panel — sits immediately below the sticky header */}
          <div className={cn("fixed left-0 right-0 z-40 border-b border-border bg-background px-4 pb-4 pt-2 sm:hidden", HEADER_OFFSET)}>
            <nav className="flex flex-col gap-1">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                    pathname === href
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
