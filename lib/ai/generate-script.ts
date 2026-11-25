import { LONG_SCENE_SECONDS } from "@/lib/projects/rules";
import { estimateDurationSeconds } from "@/lib/heygen/duration-estimate";

// AI script drafting via OpenRouter's free model router — confirmed live
// (2026-11-22) to work end to end at zero cost: it picks a free model at
// random from OpenRouter's pool (no pinned model id, since free models can
// rotate out with little notice — see https://openrouter.ai/collections/free-models).
// If OPENROUTER_API_KEY is ever unset, this degrades to a clear "not
// configured" error rather than throwing, matching lib/stripe/tax.ts's
// optional-feature convention.
const OPENROUTER_MODEL = "openrouter/free";
// The free pool is mostly reasoning models. Confirmed live (2026-11-23):
// 4 of 6 calls ran past the old 20s limit while still "thinking", and the
// cut-off reply surfaced as "didn't return a script". Both routes that call
// this set maxDuration = 60, so keep this comfortably under that.
const REQUEST_TIMEOUT_MS = 45000;
const TIMEOUT_ERROR = "The script generator is taking longer than usual right now. Please try again.";

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

export type GenerateScriptResult =
  | { ok: true; script: string }
  | { ok: false; error: string };

// Shared style guidelines for every prompt below, matching the scene
// editor's own "Writing tips" so generated scripts need no rewriting.
//
// Prompt text in this file deliberately contains no em or en dashes: models
// copy the punctuation of their instructions, so a prompt full of dashes
// teaches the very habit it forbids. tidyScript() below still removes any
// that slip through.
//
// The calm ending is a real rendering constraint (the avatar freezes on
// whichever frame the audio ends on), so it applies to every script. It has
// no "thanks for watching" example on purpose: confirmed live that one made
// the model repeat it on every slide. buildPositionGuidance is the only
// place that says when a greeting or sign-off is actually appropriate.
const STYLE_GUIDELINES = [
  "- Write it the way a real person talks when explaining something to a colleague: everyday words, contractions (it's, we're, you'll) and a natural mix of short and longer sentences. It should sound like someone speaking, not like an article being read out.",
  "- Plain spoken sentences only. No bullet points, headings, lists, emojis, hashtags or formatting symbols such as asterisks.",
  "- Never use em dashes or en dashes. Use a comma, a full stop or a new sentence instead.",
  "- Avoid phrases that sound machine-written or salesy, such as \"in today's fast-paced world\", \"delve into\", \"dive in\", \"unlock\", \"harness the power of\", \"game-changer\", \"seamless\", \"elevate\", \"it's important to note\" and \"in conclusion\". Say things simply and specifically instead.",
  "- Use Australian English spelling (for example organisation, colour, realise).",
  // Confirmed live (2026-11-23): without this a model opened with "I'm
  // Alex", a made-up presenter name, when the avatar is a real person.
  "- Don't give the speaker a name and don't invent statistics, prices, dates or other specific facts. If a detail isn't given, keep it general.",
  "- About 30 to 45 seconds spoken aloud (roughly 75 to 115 words).",
  "- End on a calm, complete sentence rather than trailing off mid-thought. Don't add a sign-off or farewell unless told below that this is the last slide.",
  // Same literal tag as PAUSE_SNIPPET in components/dashboard/video/
  // insert-pause-button.tsx, the one pause syntax the text-to-speech engine
  // honours (only on voices tagged "Pauses", which the AI can't know).
  "- Where a brief pause would sound natural (after a question, before a key point), you may insert <break time=\"1s\"/>. Use it sparingly: at most one or two per script, never back to back.",
  "- Return only the script text itself. No stage directions, scene labels, notes or surrounding quotation marks.",
].join("\n");

function buildTopicPrompt(topic: string): string {
  return [
    "Write a short, natural-sounding video script for someone to say directly to camera.",
    `Topic: ${topic}`,
    "Guidelines:",
    STYLE_GUIDELINES,
  ].join("\n");
}

// Splits a rewrite response into one or more scenes — see buildRewritePrompt.
// Not expected inside a normal spoken script, so a plain split is safe.
const SCENE_BREAK = "[[SCENE_BREAK]]";

// Where this slide sits among the ones that will actually become scenes
// (index is 0-based; total excludes blank pages/slides, which never reach
// this function at all — see import-document/route.ts's positionForSlide).
export type SlidePosition = { index: number; total: number };

function buildPositionGuidance(position: SlidePosition): string {
  const { index, total } = position;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const lines = [`This is slide ${index + 1} of ${total} in the presentation, in order.`];

  lines.push(
    isFirst
      ? "- This IS the first slide. It's fine to open with a brief greeting or kickoff line (for example \"Hi there, let's get started.\")."
      : "- This is NOT the first slide. Don't re-open with a greeting, \"welcome\" or \"let's get started\". Continue naturally, as if picking up partway through the same talk, not starting a new video.",
  );
  lines.push(
    isLast
      ? "- This IS the last slide. It's fine, and encouraged, to end with a genuine sign-off (for example \"Thanks for watching.\")."
      : "- This is NOT the last slide, so more content follows after it. Don't sign off or say anything like \"thanks for watching\" yet. That only belongs on the actual last slide.",
  );
  return lines.join("\n");
}

// For document import (lib/projects/service.ts's importScenesFromDocument):
// the source is a slide or PDF page's raw extracted text — often dense,
// bullet-pointed, or written for reading, not speaking. This rewrites it
// into spoken narration rather than inventing new content from a topic.
// Explicitly allowed to become more than one scene: a single text-heavy
// page crammed into one ~30-45s script either loses most of its content or
// blows well past the "long scene" guidance — better to let it become
// several natural scenes, each its own short, complete script, the same
// way a person would split a long slide by hand.
function buildRewritePrompt(sourceText: string, otherSlidesContext?: string, position?: SlidePosition): string {
  return [
    "The following is raw text extracted from one slide or page of a presentation document.",
    "Rewrite it as a short, natural-sounding video script for someone to say directly to camera,",
    "preserving its key points and meaning rather than inventing new content.",
    // Confirmed live (2026-11-23): without this, buzzwords in the slide
    // ("Seamless integration", "Unlock real-time insights") survived the
    // rewrite despite the style guidelines.
    "Keep the meaning, but say any marketing buzzwords from the source in plain, everyday words instead of repeating them.",
    ...(position ? ["\n" + buildPositionGuidance(position)] : []),
    ...(otherSlidesContext
      ? [
          "\nFor context, here's a brief outline of the OTHER slides/pages in this same presentation.",
          "Do not rewrite, summarize, or repeat any of these. They exist only so you can keep a",
          "consistent flow and avoid restating a point this presentation already makes elsewhere.",
          "Only rewrite the slide's own text given below, under \"Source text\":",
          otherSlidesContext,
        ]
      : []),
    "\nMost source text fits in a single short script. Only do the following when it genuinely doesn't fit:",
    `if the content is substantial enough that one script (per the guidelines below) can't cover it`,
    `naturally, split it into multiple separate scripts instead of cramming everything into one, each`,
    `a self-contained scene that follows the same guidelines (including its own calm closing line),`,
    `separated by a line containing only ${SCENE_BREAK}.`,
    "Guidelines:",
    STYLE_GUIDELINES,
    "\nSource text:",
    sourceText,
  ].join("\n");
}

// Free models don't reliably follow the "no dashes" guideline (same lesson
// as SCENE_BREAK below), so dashes are also removed here. A comma gives the
// same short pause when spoken. Ordinary hyphens (well-known, 1300-555-123)
// are left alone; only spaced hyphens used as dashes are changed.
export function tidyScript(text: string): string {
  return (
    text
      // Number ranges read better aloud as words: "30–45" -> "30 to 45".
      .replace(/(\d)(?:[ \t]*[–—][ \t]*| -{1,2} )(\d)/g, "$1 to $2")
      // A dash opening or closing a line has nothing to join, so just drop it.
      .replace(/^[ \t]*(?:—|–|--)[ \t]*/gm, "")
      .replace(/[ \t]*(?:—|–|--)[ \t]*$/gm, "")
      .replace(/[ \t]*(?:—|–|--)[ \t]*/g, ", ")
      .replace(/ - /g, ", ")
      // "it ends here, ." left by a dash just before punctuation.
      .replace(/,[ \t]*([.,!?;:])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

async function callOpenRouter(prompt: string): Promise<GenerateScriptResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI script generation isn't configured yet." };
  }

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        // A short spoken script doesn't need long deliberation, and less
        // thinking means fewer replies running into the timeout. Models
        // that don't support this simply ignore it.
        reasoning: { effort: "low" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: isTimeout(err) ? TIMEOUT_ERROR : "Couldn't reach the script generator. Please try again." };
  }

  let json: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null = null;
  try {
    json = await res.json();
  } catch (err) {
    // The timeout also covers reading the body: a reasoning model can send
    // its headers and then keep thinking past the deadline.
    if (isTimeout(err)) return { ok: false, error: TIMEOUT_ERROR };
  }

  if (!res.ok) {
    return { ok: false, error: json?.error?.message ?? "Something went wrong generating that script." };
  }

  const raw = json?.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return { ok: false, error: "The generator didn't return a script. Please try again." };
  }

  return { ok: true, script: tidyScript(raw) };
}

export async function generateVideoScript(topic: string): Promise<GenerateScriptResult> {
  return callOpenRouter(buildTopicPrompt(topic));
}

// Caps the source text sent per call — a slide/page is normally well under
// this; an unusually text-dense PDF page shouldn't blow out prompt size or
// latency for what's meant to be a short spoken script anyway.
const MAX_SOURCE_TEXT_CHARS = 4000;

export type RewriteResult =
  | { ok: true; scripts: string[] }
  | { ok: false; error: string };

// Deterministic fallback for when the model ignores the SCENE_BREAK
// instruction above and returns one long script anyway — confirmed live
// (2026-11-22) that smaller free-tier models do this fairly often, so this
// can't rely on the AI alone to self-report when it should have split.
// Uses the same "too long" definition as the scene editor's own LONG_SCENE
// warning (lib/projects/rules.ts) rather than a separate word-count guess,
// so a script that wouldn't trigger that warning never gets split here
// either. Splits on sentence boundaries, grouping sentences up to that same
// length, rather than cutting mid-sentence at a fixed character count.
function splitLongScript(text: string): string[] {
  if (estimateDurationSeconds(text) <= LONG_SCENE_SECONDS) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (current && estimateDurationSeconds(candidate) > LONG_SCENE_SECONDS) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

// Plural result — see buildRewritePrompt's comment on why one page/slide
// can legitimately become more than one scene. otherSlidesContext is an
// optional brief outline of the rest of the document (see
// import-document/route.ts's contextForSlide) — each slide is still
// rewritten independently (one call, one slide, same resilience and
// fallback-splitting as before), just with enough surrounding context to
// avoid repeating itself across slides, not full-document combination.
// position (when given) is what lets a greeting only happen on the first
// slide and a sign-off only on the last, instead of every slide treating
// itself as a standalone video.
export async function rewriteAsSpokenScript(
  sourceText: string,
  otherSlidesContext?: string,
  position?: SlidePosition,
): Promise<RewriteResult> {
  const result = await callOpenRouter(
    buildRewritePrompt(sourceText.slice(0, MAX_SOURCE_TEXT_CHARS), otherSlidesContext, position),
  );
  if (!result.ok) return result;

  const marked = result.script
    .split(SCENE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
  const scripts = (marked.length > 0 ? marked : [result.script]).flatMap(splitLongScript);
  return { ok: true, scripts };
}
