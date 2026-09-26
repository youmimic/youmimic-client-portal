import { describe, expect, it } from "vitest";
import { insertPauseSnippet, PAUSE_SNIPPET } from "@/components/dashboard/video/insert-pause-button";

describe("insertPauseSnippet", () => {
  it("inserts at the cursor position, splitting the surrounding text", () => {
    const result = insertPauseSnippet("Hello world", 5, 5);
    expect(result).toBe(`Hello${PAUSE_SNIPPET} world`);
  });

  it("replaces a text selection rather than inserting inside it", () => {
    const result = insertPauseSnippet("Hello world", 6, 11);
    expect(result).toBe(`Hello ${PAUSE_SNIPPET}`);
  });

  it("appends to the end when no cursor position is known and the script has content", () => {
    const result = insertPauseSnippet("Hello world", null, null);
    expect(result).toBe(`Hello world ${PAUSE_SNIPPET}`);
  });

  it("doesn't add a leading space to an empty script", () => {
    const result = insertPauseSnippet("", null, null);
    expect(result).toBe(PAUSE_SNIPPET);
  });

  it("inserts at the very start", () => {
    const result = insertPauseSnippet("Hello", 0, 0);
    expect(result).toBe(`${PAUSE_SNIPPET}Hello`);
  });
});
