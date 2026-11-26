"use client";

import type { ReactNode } from "react";

// A same-page link that scrolls to an element, highlights it briefly
// (data-highlight="true", styled by the target) and moves focus to its first
// button, so keyboard users land on it too. Without JavaScript it still works
// as a plain #anchor jump.
export const HIGHLIGHT_MS = 2500;

export function ScrollHighlightLink({
  targetId,
  className,
  children,
}: {
  targetId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(e) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
        target.setAttribute("data-highlight", "true");
        target.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
        window.setTimeout(() => target.removeAttribute("data-highlight"), HIGHLIGHT_MS);
      }}
    >
      {children}
    </a>
  );
}
