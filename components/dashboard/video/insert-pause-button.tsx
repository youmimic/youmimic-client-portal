"use client";

import type { RefObject } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

// The only script markup the provider documents: a literal tag read by the
// text-to-speech engine, not JSON — so this is plain text insertion, nothing
// sent to the provider needs to change. Whether it's actually honoured
// depends on the chosen voice (see the "Pauses" badge in the voice picker).
export const PAUSE_SNIPPET = '<break time="1s"/>';

// Pure splice logic, pulled out of the click handler so it can be unit
// tested without a DOM/textarea — the component below is just wiring.
export function insertPauseSnippet(value: string, start: number | null, end: number | null): string {
  if (start === null || end === null) {
    return value ? `${value} ${PAUSE_SNIPPET}` : PAUSE_SNIPPET;
  }
  return value.slice(0, start) + PAUSE_SNIPPET + value.slice(end);
}

// Inserts a pause tag at the cursor (or at the end, if the textarea isn't
// focused/found) and puts the cursor back right after it, so someone can
// keep typing without hunting for their place.
export function InsertPauseButton({
  textareaRef,
  value,
  disabled,
  onInsert,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  disabled?: boolean;
  onInsert: (next: string) => void;
}) {
  function handleClick() {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    onInsert(insertPauseSnippet(value, start, end));
    if (el) {
      requestAnimationFrame(() => {
        const pos = (start ?? value.length) + PAUSE_SNIPPET.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  }

  return (
    <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={handleClick}>
      <Timer className="h-3 w-3" aria-hidden="true" />
      Insert pause
    </Button>
  );
}
