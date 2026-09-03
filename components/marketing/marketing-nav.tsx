"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEADER_OFFSET } from "@/components/marketing/marketing-header-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLink = {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
};

// Labels follow glassengine.wixstudio.com/youmimicai's nav wording (Plans,
// Connect) — only the labels changed to match, not the URLs, so existing
// links to /pricing and /contact keep working.
const navLinks: NavLink[] = [
  {
    href: "/solutions",
    label: "Solutions",
    children: [{ href: "/solutions/small-business", label: "Small Business" }],
  },
  { href: "/pricing", label: "Plans" },
  { href: "/contact", label: "Connect" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(null);

  function isActive(link: NavLink) {
    return pathname === link.href || (link.children?.some((c) => pathname === c.href) ?? false);
  }

  return (
    <>
      {/* ── Desktop nav (sm+) ────────────────────────────────────────── */}
      <nav className="hidden items-center gap-6 sm:flex">
        {navLinks.map((link) =>
          link.children ? (
            <DropdownMenu key={link.href}>
              <DropdownMenuTrigger
                className={cn(
                  "flex items-center gap-1 text-sm font-medium outline-none transition-colors hover:text-foreground",
                  isActive(link) ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {link.label}
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem render={<Link href={link.href} />}>
                  {link.label} overview
                </DropdownMenuItem>
                {link.children.map((child) => (
                  <DropdownMenuItem key={child.href} render={<Link href={child.href} />}>
                    {child.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-foreground",
                isActive(link) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ),
        )}
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
              {navLinks.map((link) =>
                link.children ? (
                  <div key={link.href}>
                    <div className="flex items-center">
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                          isActive(link) ? "bg-muted text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {link.label}
                      </Link>
                      <button
                        type="button"
                        className="rounded-md p-2.5 text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() =>
                          setOpenMobileSection((prev) => (prev === link.href ? null : link.href))
                        }
                        aria-label={`Toggle ${link.label} submenu`}
                        aria-expanded={openMobileSection === link.href}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            openMobileSection === link.href && "rotate-180",
                          )}
                        />
                      </button>
                    </div>
                    {openMobileSection === link.href && (
                      <div className="ml-3 flex flex-col gap-1 border-l border-border pl-3">
                        {link.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                              pathname === child.href ? "bg-muted text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                      isActive(link) ? "bg-muted text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}
