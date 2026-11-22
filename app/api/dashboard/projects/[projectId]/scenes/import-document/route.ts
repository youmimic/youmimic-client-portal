import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { getData as getPdfWorkerData } from "pdf-parse/worker";
import { checkRateLimit } from "@/lib/rate-limit";
import { importScenesFromDocument, ProjectError } from "@/lib/projects/service";
import { requireUserId } from "@/lib/projects/http";
import { extractPptxSlideTexts } from "@/lib/pptx-extract";
import { rewriteAsSpokenScript } from "@/lib/ai/generate-script";

// Without this, PDFParse tries to set up its "fake worker" via a dynamic
// import of pdf.worker.mjs resolved relative to its own bundled location —
// that path doesn't survive Next's dev/prod bundling (confirmed live: fails
// with "Setting up fake worker failed: Cannot find module
// '.../.next/dev/server/chunks/pdf.worker.mjs'"). getData() returns the
// worker bundled as a self-contained base64 data: URL instead, which pdfjs
// can import directly with no filesystem/bundler path involved at all.
PDFParse.setWorker(getPdfWorkerData());

// Not JSON, so this bypasses lib/projects/http.ts's readBody (which only
// handles req.json()) and parses the multipart body itself, same reasoning
// as app/api/dashboard/media/upload-watermark/route.ts.
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ALLOWED_TYPES = new Set(["application/pdf", PPTX_TYPE]);
// Generous for a slide-deck-style document (mostly text, maybe a few
// images) — keeps parsing fast and avoids tying up a function instance on
// a huge file.
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// Slides are rewritten in parallel, so the AI step takes about as long as
// the slowest single call (up to 45s, see REQUEST_TIMEOUT_MS) plus parsing.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;
  const { projectId } = await params;

  const rateLimit = await checkRateLimit({
    key: `import-document:user:${userId}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let file: File | null;
  let expectedVersion: number | null;
  let replaceExisting: boolean;
  try {
    const formData = await req.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
    const versionRaw = formData.get("expectedVersion");
    expectedVersion = typeof versionRaw === "string" && versionRaw !== "" ? Number(versionRaw) : null;
    replaceExisting = formData.get("replaceExisting") === "true";
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 422 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 422 });
  }
  if (expectedVersion === null || !Number.isFinite(expectedVersion)) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: { expectedVersion: ["Required"] } }, { status: 422 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PDF or PowerPoint (.pptx) files are supported." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 15MB)." }, { status: 422 });
  }

  const label = file.type === PPTX_TYPE ? "Slide" : "Page";
  let pageTexts: string[];
  if (file.type === PPTX_TYPE) {
    try {
      pageTexts = await extractPptxSlideTexts(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      console.error("PPTX import (parse) failed:", err);
      return NextResponse.json({ error: "Couldn't read that PowerPoint file — it may be corrupted or in the older .ppt format (only .pptx is supported)." }, { status: 422 });
    }
  } else {
    const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
    try {
      const result = await parser.getText();
      pageTexts = result.pages.map((p) => p.text);
    } catch (err) {
      console.error("PDF import (parse) failed:", err);
      return NextResponse.json({ error: "Couldn't read that PDF — it may be corrupted, password-protected, or scanned images without real text." }, { status: 422 });
    } finally {
      await parser.destroy();
    }
  }

  // From here on the work is slow enough (one AI call per page/slide) that
  // the client shouldn't just sit on a spinner with no idea what's
  // happening — streamed as newline-delimited JSON events instead of one
  // final response. The HTTP status is always 200 once this starts (status
  // can't change mid-stream); real success/failure is the stream's own
  // terminal "done"/"error" event, which the client reads instead of
  // res.ok. Early failures above this point (auth, rate limit, bad file,
  // parse errors) are unaffected — those still return a normal, immediate
  // JSON error response.
  const nonBlankCount = pageTexts.filter((t) => t.trim().length > 0).length;
  const unitPlural = label === "Slide" ? "slides" : "pages";

  // A short, bounded gist of every OTHER slide (not the one being
  // rewritten) — gives each independent AI call enough awareness of the
  // rest of the deck to avoid repeating a point and to keep a consistent
  // flow, without combining the whole document into one call (see
  // rewriteAsSpokenScript's own comment on why that's deliberately
  // avoided). Bounded per-slide so this doesn't grow large even for a
  // MAX_SCENES-sized deck.
  const GIST_CHARS = 120;
  const slideGists = pageTexts.map((t) => t.trim().replace(/\s+/g, " ").slice(0, GIST_CHARS));

  function contextForSlide(index: number): string | undefined {
    const others = slideGists
      .map((gist, i) => ({ i, gist }))
      .filter(({ i, gist }) => i !== index && gist.length > 0);
    if (others.length === 0) return undefined;
    return others.map(({ i, gist }) => `${label} ${i + 1}: ${gist}`).join("\n");
  }

  // Rank among the slides that will actually become scenes, not the raw
  // page index — a blank page in the middle of the deck shouldn't throw
  // off which slide counts as "first" or "last" for greeting/sign-off
  // purposes (see rewriteAsSpokenScript's position parameter).
  const nonBlankIndices = pageTexts
    .map((t, i) => (t.trim() ? i : null))
    .filter((i): i is number => i !== null);

  function positionForSlide(index: number): { index: number; total: number } | undefined {
    const rank = nonBlankIndices.indexOf(index);
    return rank === -1 ? undefined : { index: rank, total: nonBlankIndices.length };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({
          type: "progress",
          message: `Found ${nonBlankCount} ${nonBlankCount === 1 ? unitPlural.slice(0, -1) : unitPlural} with text. Writing scripts with AI...`,
        });

        // Each page/slide's raw extracted text is usually dense or
        // bullet-pointed (written for reading, not speaking), so it's
        // rewritten into a natural spoken script before becoming a scene —
        // in parallel (not sequentially), since a 20-scene deck calling an
        // external model one at a time would risk the route's own
        // execution time budget. Each call also gets a brief gist of every
        // OTHER slide (contextForSlide, above) so the result reads as part
        // of one coherent deck rather than N scripts written in isolation —
        // deliberately NOT one combined call for the whole document: a
        // free-tier model already confirmed unreliable at segmenting even a
        // single slide correctly would be far more likely to mis-segment an
        // entire deck, and a single failed call would then lose AI
        // rewriting for the whole document instead of just one slide.
        //
        // Best-effort per page: a failed or
        // unconfigured rewrite falls back to that page's original raw text
        // rather than failing the whole import over one slide (or over the
        // feature being unconfigured at all — rewriteAsSpokenScript returns
        // a fast ok:false immediately when OPENROUTER_API_KEY is unset, so
        // this degrades the same way with zero extra branching here).
        //
        // One page can legitimately become more than one scene — a dense
        // page's rewrite is allowed to split into several short scripts
        // instead of one overlong one (see rewriteAsSpokenScript), so each
        // page maps to an array here, flattened afterward. importScenesFromDocument's
        // own MAX_SCENES check still guards the total either way.
        let rewrittenCount = 0;
        const rewrittenGroups = await Promise.all(
          pageTexts.map(async (text, index) => {
            if (!text.trim()) return [text];
            const result = await rewriteAsSpokenScript(text, contextForSlide(index), positionForSlide(index));
            rewrittenCount += 1;
            send({
              type: "progress",
              message: `Rewrote ${label.toLowerCase()} ${rewrittenCount} of ${nonBlankCount} with AI...`,
            });
            return result.ok ? result.scripts : [text];
          }),
        );
        const rewritten = rewrittenGroups.flat();

        send({ type: "progress", message: replaceExisting ? "Replacing existing scenes..." : "Creating scenes..." });
        const result = await importScenesFromDocument(userId, projectId, expectedVersion, rewritten, label, replaceExisting);
        send({ type: "done", ...result });
      } catch (err) {
        if (err instanceof ProjectError) {
          send({ type: "error", code: err.code, message: err.message });
        } else {
          console.error("Document import (post-parse) failed:", err);
          send({ type: "error", code: "SERVER_ERROR", message: "Something went wrong on our side. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
