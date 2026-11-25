import { existsSync } from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { getData as getPdfWorkerData } from "pdf-parse/worker";

// Turns each page or slide of an uploaded document into an image of the
// whole visible page (background, text, shapes, charts, pictures), not just
// the pictures embedded in it.
//
// PDF: rendered in-process with pdf.js (via pdf-parse) on @napi-rs/canvas,
// which already runs on Vercel for text extraction.
//
// PPTX: not available. Faithful slide rendering needs LibreOffice or a
// conversion service; neither runs in this app's serverless functions, and
// adding one is a hosting and data-processing decision (decided 2026-11-23:
// PDF only for now). A future renderer only has to implement
// PageImageRenderer and be returned from pageImageRendererFor.

export type PageImageRenderer = (document: Buffer, shouldStop?: () => boolean) => Promise<Buffer[]>;

// Thrown when shouldStop() says the import was cancelled mid-render.
export class RenderStopped extends Error {}

PDFParse.setWorker(getPdfWorkerData());

// Longest edge pdf.js draws each page at, whatever the page's shape, so an
// unusually tall or wide page can't allocate a huge bitmap. Normalisation
// (lib/slides/images.ts) caps stored slides at the same size.
export const RENDER_MAX_EDGE = 1920;
// Never enlarge a tiny page more than this (it would only add blur).
const MAX_UPSCALE = 4;
// Cap on decoding any single embedded picture, in pixels.
const MAX_EMBEDDED_IMAGE_PIXELS = 40_000_000;
const RENDER_TIMEOUT_MS = 120_000;

// pdf.js needs its bundled font data for PDFs that use the standard fonts
// (Helvetica, Times...) without embedding them; without it text falls back
// to a wrong, badly spaced font. Shipped with the function via
// outputFileTracingIncludes in next.config.ts. If it's ever missing, pages
// still render, just with the fallback font.
function standardFontDataUrl(): string | undefined {
  const dir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  return existsSync(dir) ? dir.split(path.sep).join("/") + "/" : undefined;
}

export class DocumentRenderError extends Error {}

// Renders one page at a time (so only one page's bitmap is in memory),
// scaled so its longest edge is RENDER_MAX_EDGE. shouldStop is checked
// between pages so a cancelled import stops early.
export async function renderPdfPages(document: Buffer, shouldStop: () => boolean = () => false): Promise<Buffer[]> {
  const parser = new PDFParse({
    data: new Uint8Array(document),
    standardFontDataUrl: standardFontDataUrl(),
    maxImageSize: MAX_EMBEDDED_IMAGE_PIXELS,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const render = async () => {
    // parsePageInfo is needed for page sizes; without it pages is empty.
    const info = await parser.getInfo({ parsePageInfo: true });
    if (info.pages.length !== info.total) throw new DocumentRenderError("Couldn't read the page sizes of that PDF.");
    const images: Buffer[] = [];
    for (const page of [...info.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
      if (shouldStop()) throw new RenderStopped();
      const longest = Math.max(page.width, page.height, 1);
      const scale = Math.min(RENDER_MAX_EDGE / longest, MAX_UPSCALE);
      const shot = await parser.getScreenshot({ partial: [page.pageNumber], scale, imageBuffer: true, imageDataUrl: false });
      const data = shot.pages[0]?.data;
      if (!data) throw new DocumentRenderError("Couldn't turn the pages of that PDF into images.");
      images.push(Buffer.from(data));
    }
    return images;
  };
  try {
    return await Promise.race([
      render(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DocumentRenderError("Turning the pages into images took too long.")), RENDER_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (err instanceof RenderStopped) throw err;
    if (err instanceof DocumentRenderError) throw err;
    console.error("PDF page rendering failed:", err);
    throw new DocumentRenderError("Couldn't turn the pages of that PDF into images.");
  } finally {
    clearTimeout(timer);
    await parser.destroy().catch(() => {});
  }
}

export function pageImageRendererFor(mimeType: string): PageImageRenderer | null {
  return mimeType === "application/pdf" ? renderPdfPages : null;
}
