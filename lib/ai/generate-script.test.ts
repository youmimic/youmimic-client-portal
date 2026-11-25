import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVideoScript, rewriteAsSpokenScript, tidyScript } from "@/lib/ai/generate-script";

describe("tidyScript", () => {
  it.each([
    ["Our team — based in Sydney — helps you.", "Our team, based in Sydney, helps you."],
    ["Security matters—and here's why.", "Security matters, and here's why."],
    ["It takes 30–45 seconds.", "It takes 30 to 45 seconds."],
    ["It takes 30 - 45 seconds.", "It takes 30 to 45 seconds."],
    ["One thing - speed.", "One thing, speed."],
    ["Double -- hyphen dash.", "Double, hyphen dash."],
    ["It ends here —.", "It ends here."],
    ["— Opening dash.\nClosing dash —", "Opening dash.\nClosing dash"],
  ])("removes dashes: %s", (input, expected) => {
    expect(tidyScript(input)).toBe(expected);
  });

  it.each([
    "A well-known, state-of-the-art tool.",
    "Call 1300-555-123 today.",
    "Hi there.<break time=\"1s\"/> Let's go.",
    "First part.\n[[SCENE_BREAK]]\nSecond part.",
    "Hi there,\nwelcome.",
  ])("leaves normal text alone: %s", (input) => {
    expect(tidyScript(input)).toBe(input);
  });
});

describe("prompts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never contain an em or en dash, and ask for a human voice without dashes", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateVideoScript("a product launch");
    await rewriteAsSpokenScript("Slide text", "Slide 2: Pricing", { index: 1, total: 3 });

    for (const call of fetchMock.mock.calls) {
      const prompt: string = JSON.parse(call[1].body).messages[0].content;
      expect(prompt).not.toMatch(/[—–]/);
      expect(prompt).toContain("Never use em dashes or en dashes");
      expect(prompt).toContain("the way a real person talks");
    }
  });

  it("strips dashes from the model's reply even when it ignores the instruction", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Staying safe online — it starts with you." } }] }),
      }),
    );

    expect(await generateVideoScript("cyber safety")).toEqual({ ok: true, script: "Staying safe online, it starts with you." });
    expect(await rewriteAsSpokenScript("Slide text")).toEqual({ ok: true, scripts: ["Staying safe online, it starts with you."] });
  });
});

describe("generateVideoScript", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("returns an error without throwing when OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({ ok: false, error: "AI script generation isn't configured yet." });
  });

  it("returns the generated script on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "  Hello there.  " } }] }),
      }),
    );

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({ ok: true, script: "Hello there." });
  });

  it("surfaces the upstream error message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Rate limited" } }),
      }),
    );

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({ ok: false, error: "Rate limited" });
  });

  it("returns a fallback error when the response has no script", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
      }),
    );

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({ ok: false, error: "The generator didn't return a script. Please try again." });
  });

  it("says the generator is slow, not empty, when the request times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({
      ok: false,
      error: "The script generator is taking longer than usual right now. Please try again.",
    });
  });

  it("treats a reply cut off by the timeout while reading as slow, not empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new DOMException("timed out", "TimeoutError");
        },
      }),
    );

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({
      ok: false,
      error: "The script generator is taking longer than usual right now. Please try again.",
    });
  });

  it("returns a fallback error when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateVideoScript("a new product launch");
    expect(result).toEqual({ ok: false, error: "Couldn't reach the script generator. Please try again." });
  });
});

describe("rewriteAsSpokenScript", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("rewrites raw extracted slide text into a single-scene spoken script", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Here's what this slide is about." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteAsSpokenScript("- Q3 revenue up 20%\n- New product launch\n- Hiring plans");
    expect(result).toEqual({ ok: true, scripts: ["Here's what this slide is about."] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Q3 revenue up 20%");
    expect(body.messages[0].content).toContain("raw text extracted from one slide or page");
  });

  it("includes the other-slides context when given one, with an instruction not to rewrite it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script for this slide." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("This slide's own text", "Slide 1: Intro to the company\nSlide 3: Pricing details");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Slide 1: Intro to the company");
    expect(prompt).toContain("Slide 3: Pricing details");
    expect(prompt).toContain("Do not rewrite, summarize, or repeat any of these");
    expect(prompt).toContain("This slide's own text");
  });

  it("omits the context section entirely when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("Just this slide's text");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).not.toContain("OTHER slides");
  });

  it("tells the model a greeting is fine on the first slide of several, but not a sign-off", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("Slide text", undefined, { index: 0, total: 4 });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).toContain("slide 1 of 4");
    expect(prompt).toContain("This IS the first slide");
    expect(prompt).toContain("This is NOT the last slide");
  });

  it("tells the model a sign-off is fine on the last slide, but not a greeting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("Slide text", undefined, { index: 3, total: 4 });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).toContain("slide 4 of 4");
    expect(prompt).toContain("This is NOT the first slide");
    expect(prompt).toContain("This IS the last slide");
  });

  it("tells the model neither a greeting nor a sign-off belongs on a middle slide", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("Slide text", undefined, { index: 1, total: 4 });

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).toContain("This is NOT the first slide");
    expect(prompt).toContain("This is NOT the last slide");
  });

  it("omits position guidance entirely when no position is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("Slide text");

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(prompt).not.toContain("This IS the first slide");
    expect(prompt).not.toContain("This IS the last slide");
  });

  it("splits a response into multiple scenes on the scene-break marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "First scene script.\n[[SCENE_BREAK]]\nSecond scene script." } }],
        }),
      }),
    );

    const result = await rewriteAsSpokenScript("a very dense, multi-topic slide");
    expect(result).toEqual({ ok: true, scripts: ["First scene script.", "Second scene script."] });
  });

  it("falls back to splitting on sentence boundaries when the model ignores the marker and returns one long script", async () => {
    // 300 words at the same 150 wpm this app uses elsewhere (lib/heygen/
    // duration-estimate.ts) estimates to 120s — well over the 60s LONG_SCENE
    // threshold (lib/projects/rules.ts), with no [[SCENE_BREAK]] marker at
    // all, mirroring a real response confirmed live (2026-11-22) from a
    // smaller free-tier model that didn't follow the splitting instruction.
    const longScript = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i + 1} about our update.`).join(" ");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: longScript } }] }),
      }),
    );

    const result = await rewriteAsSpokenScript("a very dense, multi-topic slide");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scripts.length).toBeGreaterThan(1);
    // Every chunk should itself be back under the same threshold, and
    // rejoining them should losslessly reproduce the original sentences.
    expect(result.scripts.join(" ").replace(/\s+/g, " ")).toBe(longScript.replace(/\s+/g, " "));
  });

  it("does not split a script that's already within the normal length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "A short, normal-length script about our product." } }] }),
      }),
    );

    const result = await rewriteAsSpokenScript("some slide content");
    expect(result).toEqual({ ok: true, scripts: ["A short, normal-length script about our product."] });
  });

  it("truncates unusually long source text before sending it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Short script." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await rewriteAsSpokenScript("x".repeat(10_000));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const sourceTextLength = body.messages[0].content.split("Source text:\n")[1].length;
    expect(sourceTextLength).toBe(4000);
  });

  it("returns an error without throwing when OPENROUTER_API_KEY is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await rewriteAsSpokenScript("some slide content");
    expect(result).toEqual({ ok: false, error: "AI script generation isn't configured yet." });
  });
});
