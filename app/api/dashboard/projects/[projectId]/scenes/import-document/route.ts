import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { getData as getPdfWorkerData } from "pdf-parse/worker";
import { checkRateLimit } from "@/lib/rate-limit";
import { countProjectScenes, importScenesFromDocument, ProjectError } from "@/lib/projects/service";
import { requireUserId } from "@/lib/projects/http";
import { MAX_SCENES } from "@/lib/projects/rules";
import { planImportedScenes, type ImportPresentation } from "@/lib/projects/import-plan";
import { extractPptxSlideTexts, PptxLimitError } from "@/lib/pptx-extract";
import { rewriteAsSpokenScript } from "@/lib/ai/generate-script";
import { mapWithConcurrency } from "@/lib/concurrency";
import { DocumentRenderError, pageImageRendererFor, RenderStopped } from "@/lib/slides/render-document";
import {
  discardUnusedSlideImages,
  normaliseSlideImage,
  pruneUnusedSlideImages,
  SlideImageError,
  storeSlideImage,
} from "@/lib/slides/images";

class ImportCancelled extends Error {}

// Without this, PDFParse tries to set up its "fake worker" via a dynamic
// import of pdf.worker.mjs resolved relative to its own bundled location,
// which doesn't survive Next's bundling (confirmed live). getData() returns
// the worker as a self-contained data: URL instead.
PDFParse.setWorker(getPdfWorkerData());

// Not JSON, so this bypasses lib/projects/http.ts's readBody and parses the
// multipart body itself, same as the watermark upload route.
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ALLOWED_TYPES = new Set(["application/pdf", PPTX_TYPE]);
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// Fluid compute is enabled on this project (confirmed by the owner,
// 2026-11-23), which allows up to 300s. Rendering, uploads and AI all run
// in parallel and are bounded below, so a full 20-page deck normally takes
// well under a minute; the headroom covers slow AI replies (up to 45s each).
export const maxDuration = 300;

// At most this many pages are uploaded, or rewritten by AI, at once.
const IMAGE_CONCURRENCY = 4;
const AI_CONCURRENCY = 4;

// Flow: validate -> extract text -> check the scene limit -> (stream)
// render + store page images and rewrite narration, in parallel -> plan the
// scenes -> one short transaction that re-checks version, ownership and the
// generation lock. Existing scenes are only touched in that transaction, so
// any earlier failure or a cancel leaves the project exactly as it was, and
// slide images created along the way are cleaned up.
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
  let presentation: ImportPresentation;
  try {
    const formData = await req.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
    const versionRaw = formData.get("expectedVersion");
    expectedVersion = typeof versionRaw === "string" && versionRaw !== "" ? Number(versionRaw) : null;
    replaceExisting = formData.get("replaceExisting") === "true";
    // Absent means Avatar, which is what this route always did before.
    const presentationRaw = formData.get("presentation") ?? "AVATAR";
    if (presentationRaw !== "AVATAR" && presentationRaw !== "SLIDE") {
      return NextResponse.json({ error: "Validation failed", fieldErrors: { presentation: ["Invalid"] } }, { status: 422 });
    }
    presentation = presentationRaw;
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

  // Slide images can only be made from PDFs (see lib/slides/render-document.ts).
  // Asking for slides from a PowerPoint is refused rather than silently
  // imported as Avatar scenes.
  const renderPages = pageImageRendererFor(file.type);
  if (presentation === "SLIDE" && !renderPages) {
    return NextResponse.json(
      {
        error:
          "Slide images can only be made from PDF files for now. Save your presentation as a PDF and import that, or import it as Avatar scenes.",
      },
      { status: 422 },
    );
  }

  const label = file.type === PPTX_TYPE ? "Slide" : "Page";
  const documentBuffer = Buffer.from(await file.arrayBuffer());
  let pageTexts: string[];
  if (file.type === PPTX_TYPE) {
    try {
      pageTexts = await extractPptxSlideTexts(documentBuffer);
    } catch (err) {
      if (err instanceof PptxLimitError) return NextResponse.json({ error: err.message }, { status: 422 });
      console.error("PPTX import (parse) failed:", err);
      return NextResponse.json(
        { error: "Couldn't read that PowerPoint file. It may be damaged or in the older .ppt format (only .pptx is supported)." },
        { status: 422 },
      );
    }
  } else {
    const parser = new PDFParse({ data: new Uint8Array(documentBuffer) });
    try {
      // Count pages first, so a very long PDF is refused before any text
      // extraction (and long before rendering or AI).
      const { total } = await parser.getInfo();
      if (total > MAX_SCENES) {
        return NextResponse.json(
          {
            error: `That PDF has ${total} pages, but a video can have up to ${MAX_SCENES} scenes. Nothing was changed. Try a shorter file.`,
          },
          { status: 422 },
        );
      }
      const result = await parser.getText();
      pageTexts = result.pages.map((p) => p.text);
    } catch (err) {
      console.error("PDF import (parse) failed:", err);
      return NextResponse.json({ error: "Couldn't read that PDF. It may be damaged or password-protected." }, { status: 422 });
    } finally {
      await parser.destroy();
    }
  }

  // Checked before any rendering or AI work. With page images every page
  // becomes a scene (a picture-only page is kept for the user to narrate);
  // without them only pages with text do. Splitting dense pages can add
  // more, which the final transaction checks again.
  const unitPlural = label === "Slide" ? "slides" : "pages";
  const usablePages = renderPages ? pageTexts.length : pageTexts.filter((t) => t.trim()).length;
  try {
    const kept = replaceExisting ? 0 : await countProjectScenes(userId, projectId);
    if (usablePages > MAX_SCENES - kept) {
      return NextResponse.json(
        {
          error: `That file has ${usablePages} ${unitPlural}, but a video can have up to ${MAX_SCENES} scenes${
            kept > 0 ? ` and this project already has ${kept}` : ""
          }. Nothing was changed. Try a shorter file${kept > 0 ? ", or replace the current scenes" : ""}.`,
        },
        { status: 422 },
      );
    }
  } catch (err) {
    if (err instanceof ProjectError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    throw err;
  }
  if (usablePages === 0) {
    return NextResponse.json({ error: "Couldn't find any readable text in that file." }, { status: 422 });
  }

  // A short gist of every OTHER page, so each independent AI call can keep
  // a consistent flow without the whole document going into one call.
  const GIST_CHARS = 120;
  const gists = pageTexts.map((t) => t.trim().replace(/\s+/g, " ").slice(0, GIST_CHARS));
  const contextFor = (index: number) => {
    const others = gists.map((gist, i) => ({ i, gist })).filter(({ i, gist }) => i !== index && gist.length > 0);
    return others.length === 0 ? undefined : others.map(({ i, gist }) => `${label} ${i + 1}: ${gist}`).join("\n");
  };
  // Greeting/sign-off position counts only pages with text, so a picture
  // page in the middle doesn't change which page counts as first or last.
  const textIndices = pageTexts.map((t, i) => (t.trim() ? i : null)).filter((i): i is number => i !== null);
  const positionFor = (index: number) => {
    const rank = textIndices.indexOf(index);
    return rank === -1 ? undefined : { index: rank, total: textIndices.length };
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser stopped listening (cancelled); keep going quietly.
        }
      };
      const createdImageIds: string[] = [];
      let committed = false;
      // Checked between every page render, upload and AI call, so a cancel
      // stops the work early instead of only before saving.
      const cancelled = () => req.signal.aborted;
      const stopIfCancelled = () => {
        if (cancelled()) throw new ImportCancelled();
      };

      try {
        send({ type: "progress", message: `Reading ${pageTexts.length} ${pageTexts.length === 1 ? unitPlural.slice(0, -1) : unitPlural}...` });

        const prepareImages = async (): Promise<(string | null)[]> => {
          if (!renderPages) return pageTexts.map(() => null);
          send({ type: "progress", message: "Preparing slide images..." });
          const rendered = await renderPages(documentBuffer, cancelled);
          let done = 0;
          return mapWithConcurrency(pageTexts, IMAGE_CONCURRENCY, async (_, i) => {
            stopIfCancelled();
            const png = rendered[i];
            if (!png) return null;
            const stored = await storeSlideImage(userId, await normaliseSlideImage(png));
            createdImageIds.push(stored.id);
            done += 1;
            send({ type: "progress", message: `Prepared slide image ${done} of ${pageTexts.length}...` });
            return stored.id;
          });
        };

        // Best effort per page: a failed or unconfigured rewrite falls back to
        // that page's own text. Results keep page order whatever order the
        // calls finish in.
        // Fallbacks are counted and the first reason is logged, so a missing
        // OPENROUTER_API_KEY or a provider outage shows up in the logs and in
        // the import notice instead of passing for a normal import.
        let pagesWithoutAiScript = 0;
        let aiFailureLogged = false;
        const prepareNarration = async (): Promise<string[][]> => {
          let done = 0;
          return mapWithConcurrency(pageTexts, AI_CONCURRENCY, async (text, i) => {
            stopIfCancelled();
            if (!text.trim()) return [];
            const result = await rewriteAsSpokenScript(text, contextFor(i), positionFor(i));
            done += 1;
            send({ type: "progress", message: `Prepared narration ${done} of ${textIndices.length}...` });
            if (result.ok) return result.scripts;
            pagesWithoutAiScript += 1;
            if (!aiFailureLogged) {
              aiFailureLogged = true;
              console.warn(`Document import: AI script rewrite failed, using the page's own text (${result.error})`);
            }
            return [text];
          });
        };

        const [imageIds, narration] = await Promise.all([prepareImages(), prepareNarration()]);

        // Last point at which stopping is guaranteed safe: nothing has been
        // saved to the project yet. A cancel that arrives after this check
        // can't stop the transaction below; the browser reconciles by
        // reloading (see runImportDocument).
        stopIfCancelled();

        const plan = planImportedScenes(
          pageTexts.map((_, i) => ({ scripts: narration[i], slideImageId: imageIds[i] })),
          label,
          presentation,
        );

        send({ type: "progress", message: replaceExisting ? "Replacing your scenes..." : "Creating scenes..." });
        const result = await importScenesFromDocument(userId, projectId, expectedVersion, plan.scenes, {
          replaceExisting,
          pagesSkipped: plan.pagesSkipped,
        });
        committed = true;
        send({ type: "done", ...result, scenesNeedingNarration: plan.scenesNeedingNarration, pagesWithoutAiScript });
        // Replaced scenes may have left slide images nothing uses any more.
        if (replaceExisting) {
          await pruneUnusedSlideImages(userId).catch((e) => console.error("Slide image pruning failed:", e));
        }
      } catch (err) {
        // Images made for this import aren't used by any scene yet, so they
        // can go. discardUnusedSlideImages never removes one a scene uses,
        // and a clean-up failure only leaves an unused image behind.
        if (!committed) {
          await discardUnusedSlideImages(userId, createdImageIds).catch((e) => console.error("Import clean-up failed:", e));
        }
        if (err instanceof ImportCancelled || err instanceof RenderStopped) {
          send({ type: "error", code: "CANCELLED", message: "Import cancelled before anything was saved. Nothing was changed." });
        } else if (err instanceof ProjectError) {
          send({ type: "error", code: err.code, message: err.message });
        } else if (err instanceof DocumentRenderError || err instanceof SlideImageError) {
          send({ type: "error", code: "CONVERSION_FAILED", message: `${err.message} Nothing was changed.` });
        } else {
          console.error("Document import (post-parse) failed:", err);
          send({ type: "error", code: "SERVER_ERROR", message: "Something went wrong on our side. Nothing was changed. Please try again." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
