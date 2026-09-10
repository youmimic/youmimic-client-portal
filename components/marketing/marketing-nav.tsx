"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
// Solutions has no dropdown/children for now — Small Business and the
// Solutions submenu are hidden per the client's urgent fix list, not
// deleted, so they're easy to bring back later.
const navLinks: NavLink[] = [
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Plans" },
  { href: "/contact", label: "Connect" },
];

const MOBILE_NAV_PANEL_ID = "mobile-nav-panel";

// The header (and this nav) is permanently dark/charcoal regardless of the
// site's light/dark theme toggle, matching the footer — so links use
// explicit light-on-dark colors rather than theme tokens. `hover:!text-white`
// uses Tailwind's important modifier for the same reason the footer's links
// do: needed to win over the active-state inline color below.
const navLinkClassName = "text-sm font-medium transition-colors hover:!text-white";
function navLinkStyle(active: boolean) {
  return { color: active ? "#FFFFFF" : "rgba(255,255,255,0.7)" };
}

export function MarketingNav({ isLoggedIn = false }: { isLoggedIn?: boolean } = {}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  function isActive(link: NavLink) {
    return pathname === link.href || (link.children?.some((c) => pathname === c.href) ?? false);
  }

  // Close the mobile panel on any route change — covers back/forward and
  // programmatic navigation, not just a direct click on a rendered Link.
  // Adjusting state during render (React's documented pattern for "reset
  // state when a prop changes") rather than in an effect, since an
  // unconditional setState in an effect body triggers an extra render
  // every time regardless of whether anything actually changed.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  // While the mobile panel is open: lock body scroll and let Escape close
  // it (returning focus to the toggle button, since it's the thing that
  // opened the panel).
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      {/* ── Desktop nav (sm+) ────────────────────────────────────────── */}
      <nav className="hidden items-center gap-6 sm:flex">
        {navLinks.map((link) =>
          link.children ? (
            <div key={link.href} className="flex items-center gap-0.5">
              <Link
                href={link.href}
                className={navLinkClassName}
                style={navLinkStyle(isActive(link))}
              >
                {link.label}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${link.label} submenu`}
                  className="flex items-center rounded-sm p-0.5 outline-none transition-colors hover:!text-white focus-visible:ring-3 focus-visible:ring-ring/50"
                  style={navLinkStyle(isActive(link))}
                >
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {link.children.map((child) => (
                    <DropdownMenuItem key={child.href} render={<Link href={child.href} />}>
                      {child.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className={navLinkClassName}
              style={navLinkStyle(isActive(link))}
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>

      {/* ── Mobile hamburger toggle (< sm) ───────────────────────────── */}
      <button
        ref={toggleButtonRef}
        type="button"
        className="flex items-center justify-center rounded-md p-2 text-white/70 transition-colors hover:text-white sm:hidden"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls={MOBILE_NAV_PANEL_ID}
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
          <div
            id={MOBILE_NAV_PANEL_ID}
            className={cn("fixed left-0 right-0 z-40 border-b border-white/10 px-4 pb-4 pt-2 sm:hidden", HEADER_OFFSET)}
            style={{ backgroundColor: "#333333" }}
          >
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) =>
                link.children ? (
                  <div key={link.href}>
                    <div className="flex items-center">
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:!text-white hover:bg-white/10"
                        style={navLinkStyle(isActive(link))}
                      >
                        {link.label}
                      </Link>
                      <button
                        type="button"
                        className="rounded-md p-2.5 text-white/70 transition-colors hover:text-white"
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
                      <div className="ml-3 flex flex-col gap-1 border-l border-white/10 pl-3">
                        {link.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsOpen(false)}
                            className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:!text-white hover:bg-white/10"
                            style={navLinkStyle(pathname === child.href)}
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
                    className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:!text-white hover:bg-white/10"
                    style={navLinkStyle(isActive(link))}
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>

            {/* Sign in/Get Started (or Dashboard, if already logged in)
                live only here on mobile — the header bar itself hides
                them below sm: to keep the top bar from getting cramped
                next to the hamburger toggle. */}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
                Theme
              </span>
              <ThemeToggle className="text-white hover:!text-white hover:bg-white/10" />
            </div>

            <div
              className="mt-3 flex flex-col gap-2"
              onClick={() => setIsOpen(false)}
            >
              {isLoggedIn ? (
                <Button size="sm" asChild className="w-full">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="w-full text-white hover:!text-white hover:bg-white/10"
                  >
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button size="sm" asChild className="w-full">
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
