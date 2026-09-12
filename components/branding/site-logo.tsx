"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type SiteLogoProps = {
  href?: string;
  className?: string;
  forceVariant?: "light" | "dark" | "auto";
  // Overrides just the icon's light/dark pick, independent of forceVariant
  // (which otherwise drives both the icon and the wordmark together) — for
  // contexts like the always-dark header/footer that want the white
  // wordmark but the brand teal icon rather than the inverted-to-white one.
  iconVariant?: "light" | "dark" | "auto";
  onClick?: () => void;
};

// Returns false on server/SSR pass, true after client hydration — no setState needed.
const subscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function SiteLogo({
  href = "/",
  className,
  forceVariant = "auto",
  iconVariant,
  onClick,
}: SiteLogoProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useIsMounted();

  const isDark =
    forceVariant === "dark" ||
    (forceVariant === "auto" && mounted && resolvedTheme === "dark");
  const isKnown = forceVariant !== "auto" || mounted;

  // Icon defaults to following forceVariant like the wordmark does, but a
  // caller can override just this half of the lockup (see iconVariant's
  // definition above).
  const resolvedIconVariant = iconVariant ?? forceVariant;
  const isIconDark =
    resolvedIconVariant === "dark" ||
    (resolvedIconVariant === "auto" && mounted && resolvedTheme === "dark");

  const iconSrc = isIconDark ? "/dark favicon.png" : "/green transparent favicon.png";
  const wordmarkSrc = isDark ? "/youmimic-white-transparent.png" : "/youmimic-green-transparent.png";

  // "dark favicon.png" is a solid black mark on a transparent background —
  // meant for light surfaces, not an actual dark-mode (white) variant. On a
  // dark background it's invisible, so it's flipped to white with a CSS
  // filter here rather than needing a separately-exported white asset.
  const iconStyle = isIconDark
    ? { width: "auto", filter: "brightness(0) invert(1)" }
    : { width: "auto" };

  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-1.5">
      {isKnown ? (
        <>
          <Image
            src={iconSrc}
            alt=""
            width={810}
            height={1030}
            className={cn("h-6 sm:h-7 md:h-8", className)}
            style={iconStyle}
            priority
          />
          <Image
            src={wordmarkSrc}
            alt="YouMimic"
            width={120}
            height={40}
            className={cn("h-6 sm:h-7 md:h-8", className)}
            style={{ width: "auto" }}
            priority
          />
        </>
      ) : (
        <span className="sr-only">YouMimic</span>
      )}
    </Link>
  );
}
