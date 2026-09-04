"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

type SiteLogoProps = {
  href?: string;
  className?: string;
  forceVariant?: "light" | "dark" | "auto";
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
  onClick,
}: SiteLogoProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useIsMounted();

  const isDark =
    forceVariant === "dark" ||
    (forceVariant === "auto" && mounted && resolvedTheme === "dark");
  const isKnown = forceVariant !== "auto" || mounted;

  // Favicon icon (square) and wordmark share the same light/dark switch —
  // rendered as one tight flex lockup, not two independently-placed images,
  // so they read as a single logo mark rather than a wordmark with a stray
  // icon next to it.
  const iconSrc = isDark ? "/dark favicon.png" : "/green transparent favicon.png";
  const wordmarkSrc = isDark ? "/youmimic-white-transparent.png" : "/youmimic-green-transparent.png";

  // "dark favicon.png" is a solid black mark on a transparent background —
  // meant for light surfaces, not an actual dark-mode (white) variant. On a
  // dark background it's invisible, so it's flipped to white with a CSS
  // filter here rather than needing a separately-exported white asset.
  const iconStyle = isDark
    ? { width: "auto", filter: "brightness(0) invert(1)" }
    : { width: "auto" };

  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-1.5">
      {isKnown ? (
        <>
          <Image
            src={iconSrc}
            alt=""
            width={40}
            height={40}
            className={className ?? "h-6 sm:h-7 md:h-8"}
            style={iconStyle}
            priority
          />
          <Image
            src={wordmarkSrc}
            alt="YouMimic"
            width={120}
            height={40}
            className={className ?? "h-6 sm:h-7 md:h-8"}
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
