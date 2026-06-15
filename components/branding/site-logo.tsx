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

  let src: string | null;
  if (forceVariant === "light") {
    src = "/youmimic-green-transparent.png";
  } else if (forceVariant === "dark") {
    src = "/youmimic-white-transparent.png";
  } else {
    src = mounted
      ? resolvedTheme === "dark"
        ? "/youmimic-white-transparent.png"
        : "/youmimic-green-transparent.png"
      : null;
  }

  return (
    <Link href={href} onClick={onClick}>
      {src !== null ? (
        <Image
          src={src}
          alt="YouMimic"
          width={120}
          height={40}
          className={className ?? "h-6 w-auto sm:h-7 md:h-8"}
          priority
        />
      ) : (
        <span className="sr-only">YouMimic</span>
      )}
    </Link>
  );
}
