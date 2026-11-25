import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

// The import route end to end with REAL PDF rendering (pdf.js on
// @napi-rs/canvas) and REAL PPTX parsing, on documents built here. Only the
// edges are mocked: sign-in, rate limit, the database (service), Blob
// storage and the AI.

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  countProjectScenes: vi.fn(),
  importScenesFromDocument: vi.fn(),
  rewriteAsSpokenScript: vi.fn(),
  storeSlideImage: vi.fn(),
  discardUnusedSlideImages: vi.fn(),
  pruneUnusedSlideImages: vi.fn(),
}));

vi.mock("@/lib/projects/http", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/projects/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/projects/service")>()),
  countProjectScenes: mocks.countProjectScenes,
  importScenesFromDocument: mocks.importScenesFromDocument,
}));
vi.mock("@/lib/ai/generate-script", () => ({ rewriteAsSpokenScript: mocks.rewriteAsSpokenScript }));
vi.mock("@/lib/slides/images", async (orig) => ({
  ...(await orig<typeof import("@/lib/slides/images")>()),
  storeSlideImage: mocks.storeSlideImage,
  discardUnusedSlideImages: mocks.discardUnusedSlideImages,
  pruneUnusedSlideImages: mocks.pruneUnusedSlideImages,
}));
vi.mock("@/lib/slides/render-document", async (orig) => {
  const actual = await orig<typeof import("@/lib/slides/render-document")>();
  return { ...actual, pageImageRendererFor: vi.fn(actual.pageImageRendererFor) };
});

import { POST } from "./route";
import { ProjectError } from "@/lib/projects/service";
import { DocumentRenderError, pageImageRendererFor, RenderStopped } from "@/lib/slides/render-document";

const PDF = "application/pdf";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// A real PDF: one content stream per page ("" = a page with only a shape and
// no text layer, like a chart or a scanned page).
function makePdf(pageTexts: string[], size = { width: 800, height: 600 }): Buffer {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesId = 1 + pageTexts.length * 2 + 1;
  const pageIds: number[] = [];
  for (const text of pageTexts) {
    const content = text ? `BT /F1 32 Tf 60 400 Td (${text}) Tj ET` : "1 0 0 rg 100 100 400 300 re f";
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const streamId = objs.length;
    add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 1 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(objs.length);
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

async function makePptx(slides: { text: string; notes?: string }[]): Promise<Buffer> {
  const zip = new JSZip();
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld><p:txBody><a:p><a:r><a:t>${s.text}</a:t></a:r></a:p></p:txBody></p:sld>`);
    if (s.notes) zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<p:notes><a:t>${s.notes}</a:t></p:notes>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

async function post(file: Buffer, type: string, fields: Record<string, string> = {}, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(file)], type === PDF ? "deck.pdf" : "deck.pptx", { type }));
  form.append("expectedVersion", "3");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await POST(new Request("http://localhost/api", { method: "POST", body: form, signal }), {
    params: Promise.resolve({ projectId: "p1" }),
  });
  const text = await res.text();
  const events = res.headers.get("content-type")?.includes("ndjson")
    ? text.trim().split("\n").map((l) => JSON.parse(l))
    : [];
  return { res, json: events.length ? null : JSON.parse(text), events, last: events.at(-1) };
}

let imageCount = 0;
beforeEach(() => {
  vi.clearAllMocks();
  imageCount = 0;
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.countProjectScenes.mockResolvedValue(1);
  mocks.importScenesFromDocument.mockResolvedValue({ version: 4, firstSceneId: "new1", scenesAdded: 3, pagesSkipped: 0 });
  mocks.rewriteAsSpokenScript.mockImplementation(async (text: string) => ({ ok: true, scripts: [`Spoken: ${text.trim()}`] }));
  mocks.storeSlideImage.mockImplementation(async (_u: string, img: { width: number; height: number }) => ({
    id: `img${++imageCount}`,
    url: `https://blob.example/${imageCount}.jpg`,
    width: img.width,
    height: img.height,
  }));
  mocks.discardUnusedSlideImages.mockResolvedValue(undefined);
  mocks.pruneUnusedSlideImages.mockResolvedValue({ imagesDeleted: 0, copiesDeleted: 0 });
});

describe("document import with slide images", () => {
  it("renders every PDF page to a stored image and creates Slide scenes in page order", async () => {
    const { last } = await post(makePdf(["Quarterly results", "", "Next steps"]), PDF, { presentation: "SLIDE" });

    expect(last).toMatchObject({ type: "done", scenesNeedingNarration: 1 });
    // Three real renders, each normalised to a bounded JPEG at 4:3.
    expect(mocks.storeSlideImage).toHaveBeenCalledTimes(3);
    for (const [, img] of mocks.storeSlideImage.mock.calls) {
      expect([img.width, img.height]).toEqual([1920, 1440]);
      expect(img.buffer.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    }
    // AI only for pages with text; the picture-only page is kept, unnarrated.
    expect(mocks.rewriteAsSpokenScript).toHaveBeenCalledTimes(2);
    const scenes = mocks.importScenesFromDocument.mock.calls[0][3];
    expect(scenes.map((s: { title: string; kind: string; slideImageId: string; script: string }) => [s.title, s.kind, s.script])).toEqual([
      ["Page 1", "SLIDE", "Spoken: Quarterly results"],
      ["Page 2", "SLIDE", ""],
      ["Page 3", "SLIDE", "Spoken: Next steps"],
    ]);
    expect(new Set(scenes.map((s: { slideImageId: string }) => s.slideImageId)).size).toBe(3);
    expect(mocks.discardUnusedSlideImages).not.toHaveBeenCalled();
  });

  it("still keeps the page images when importing as Avatar scenes", async () => {
    await post(makePdf(["One", "Two"]), PDF, { presentation: "AVATAR" });
    const scenes = mocks.importScenesFromDocument.mock.calls[0][3];
    expect(scenes.every((s: { kind: string; slideImageId: string | null }) => s.kind === "AVATAR" && s.slideImageId)).toBe(true);
  });

  it("gives every part of a split page the same slide image", async () => {
    mocks.rewriteAsSpokenScript.mockResolvedValue({ ok: true, scripts: ["Part A.", "Part B."] });
    await post(makePdf(["Dense slide"]), PDF, { presentation: "SLIDE" });
    const scenes = mocks.importScenesFromDocument.mock.calls[0][3];
    expect(scenes.map((s: { title: string; slideImageId: string; sourcePageNumber: number }) => [s.title, s.slideImageId, s.sourcePageNumber])).toEqual([
      ["Page 1 · Part 1", "img1", 1],
      ["Page 1 · Part 2", "img1", 1],
    ]);
  });

  it("falls back to the page's own text when the AI fails, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.rewriteAsSpokenScript.mockResolvedValue({ ok: false, error: "AI script generation isn't configured yet." });
    const { last } = await post(makePdf(["Raw slide text", "", "More text"]), PDF, { presentation: "SLIDE" });
    expect(mocks.importScenesFromDocument.mock.calls[0][3][0].script).toBe("Raw slide text");
    // Counted per text page (the picture-only page isn't sent to the AI) and logged once.
    expect(last).toMatchObject({ type: "done", pagesWithoutAiScript: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("isn't configured");
    warn.mockRestore();
  });

  it("reports no fallback pages when the AI works", async () => {
    const { last } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" });
    expect(last).toMatchObject({ type: "done", pagesWithoutAiScript: 0 });
  });

  it("passes replace mode through and keeps existing scenes out of the limit", async () => {
    mocks.countProjectScenes.mockResolvedValue(19);
    const { last } = await post(makePdf(["One", "Two"]), PDF, { presentation: "SLIDE", replaceExisting: "true" });
    expect(last.type).toBe("done");
    expect(mocks.countProjectScenes).not.toHaveBeenCalled();
    expect(mocks.importScenesFromDocument.mock.calls[0][4]).toMatchObject({ replaceExisting: true });
  });

  it("refuses before rendering or AI when the pages won't fit the scene limit", async () => {
    mocks.countProjectScenes.mockResolvedValue(19);
    const { res, json } = await post(makePdf(["One", "Two"]), PDF, { presentation: "SLIDE" });
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/up to 20 scenes and this project already has 19\. Nothing was changed/);
    expect(mocks.storeSlideImage).not.toHaveBeenCalled();
    expect(mocks.rewriteAsSpokenScript).not.toHaveBeenCalled();
  });

  it("reports a conversion failure, changes nothing and creates nothing", async () => {
    vi.mocked(pageImageRendererFor).mockReturnValueOnce(async () => {
      throw new DocumentRenderError("Couldn't turn the pages of that PDF into images.");
    });
    const { last } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" });
    expect(last).toEqual({ type: "error", code: "CONVERSION_FAILED", message: "Couldn't turn the pages of that PDF into images. Nothing was changed." });
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
  });

  it("cleans up uploaded images when a later upload fails", async () => {
    mocks.storeSlideImage
      .mockResolvedValueOnce({ id: "img1", url: "u1", width: 1, height: 1 })
      .mockRejectedValueOnce(new Error("Blob down"));
    const { last } = await post(makePdf(["One", "Two"]), PDF, { presentation: "SLIDE" });
    expect(last).toMatchObject({ type: "error", code: "SERVER_ERROR" });
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
    expect(mocks.discardUnusedSlideImages).toHaveBeenCalledWith("u1", ["img1"]);
  });

  it("reports a version conflict at commit and removes the images it made", async () => {
    mocks.importScenesFromDocument.mockRejectedValue(new ProjectError("VERSION_CONFLICT", 409, "Changed elsewhere."));
    const { last } = await post(makePdf(["One", "Two"]), PDF, { presentation: "SLIDE" });
    expect(last).toEqual({ type: "error", code: "VERSION_CONFLICT", message: "Changed elsewhere." });
    expect(mocks.discardUnusedSlideImages.mock.calls[0][1].sort()).toEqual(["img1", "img2"]);
  });

  // Every image this import stored was handed to clean-up (stored ⊆ discarded).
  const storedIds = () => mocks.storeSlideImage.mock.results.map((r) => (r.value as Promise<{ id: string }>));
  async function expectAllStoredDiscarded() {
    const stored = await Promise.all(storedIds());
    const discarded = mocks.discardUnusedSlideImages.mock.calls.flatMap((c) => c[1] as string[]);
    for (const img of stored) expect(discarded).toContain(img.id);
  }

  it("cancel during AI rewriting: stops, saves nothing, cleans up anything stored", async () => {
    const controller = new AbortController();
    mocks.rewriteAsSpokenScript.mockImplementation(async (text: string) => {
      controller.abort();
      return { ok: true, scripts: [text] };
    });
    const { last } = await post(makePdf(["One", "Two", "Three"]), PDF, { presentation: "SLIDE" }, controller.signal);
    expect(last).toMatchObject({ type: "error", code: "CANCELLED" });
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
    await expectAllStoredDiscarded();
  });

  it("cancel during page rendering: the renderer is told to stop, nothing is stored or saved", async () => {
    const controller = new AbortController();
    vi.mocked(pageImageRendererFor).mockReturnValueOnce(async (_doc, shouldStop) => {
      controller.abort();
      expect(shouldStop?.()).toBe(true);
      throw new RenderStopped();
    });
    mocks.rewriteAsSpokenScript.mockResolvedValue({ ok: true, scripts: ["x"] });
    const { last } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" }, controller.signal);
    expect(last).toMatchObject({ type: "error", code: "CANCELLED" });
    expect(mocks.storeSlideImage).not.toHaveBeenCalled();
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
  });

  it("cancel right before the final transaction: still nothing saved, stored images cleaned up", async () => {
    const controller = new AbortController();
    // Abort only once the image has been stored and the AI has answered,
    // i.e. at the last moment before saving.
    mocks.rewriteAsSpokenScript.mockImplementation(async (text: string) => {
      await vi.waitFor(() => expect(mocks.storeSlideImage).toHaveBeenCalled());
      await Promise.all(storedIds());
      controller.abort();
      return { ok: true, scripts: [text] };
    });
    const { last } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" }, controller.signal);
    expect(last).toMatchObject({ type: "error", code: "CANCELLED" });
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
    expect(mocks.discardUnusedSlideImages).toHaveBeenCalledWith("u1", ["img1"]);
  });

  it("disconnect while the transaction commits: the save stands and its images are NOT deleted", async () => {
    const controller = new AbortController();
    mocks.importScenesFromDocument.mockImplementation(async () => {
      controller.abort(); // browser goes away mid-commit
      return { version: 4, firstSceneId: "new1", scenesAdded: 1, pagesSkipped: 0 };
    });
    const { events } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" }, controller.signal);
    expect(mocks.importScenesFromDocument).toHaveBeenCalledOnce();
    expect(mocks.discardUnusedSlideImages).not.toHaveBeenCalled();
    // Never claims a cancel once the save has happened.
    expect(events.some((e: { code?: string }) => e.code === "CANCELLED")).toBe(false);
  });

  it("a clean-up failure after a cancel still reports the cancel accurately and saves nothing", async () => {
    const controller = new AbortController();
    mocks.discardUnusedSlideImages.mockRejectedValue(new Error("Blob down"));
    mocks.rewriteAsSpokenScript.mockImplementation(async (text: string) => {
      controller.abort();
      return { ok: true, scripts: [text] };
    });
    const { last } = await post(makePdf(["One"]), PDF, { presentation: "SLIDE" }, controller.signal);
    expect(last).toMatchObject({ type: "error", code: "CANCELLED" });
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
  });

  it("prunes images left unused by the scenes a replace import removed", async () => {
    await post(makePdf(["One"]), PDF, { presentation: "SLIDE", replaceExisting: "true" });
    expect(mocks.pruneUnusedSlideImages).toHaveBeenCalledWith("u1");
  });

  it("checks the page count before extracting text or doing any work", async () => {
    const pages = Array.from({ length: 21 }, (_, i) => `Page ${i + 1}`);
    const { res, json } = await post(makePdf(pages), PDF, { presentation: "SLIDE", replaceExisting: "true" });
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/has 21 pages/);
    expect(mocks.rewriteAsSpokenScript).not.toHaveBeenCalled();
    expect(mocks.storeSlideImage).not.toHaveBeenCalled();
  });

  it("renders a very tall page with its longest edge bounded, so memory stays bounded", async () => {
    await post(makePdf(["Tall"], { width: 600, height: 6000 }), PDF, { presentation: "SLIDE" });
    const [, img] = mocks.storeSlideImage.mock.calls[0];
    expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(1920);
    expect(img.height).toBe(1920);
  });
});

describe("PowerPoint import", () => {
  it("uses speaker notes for narration and imports Avatar scenes without slide images", async () => {
    const pptx = await makePptx([{ text: "Welcome", notes: "Say hello warmly" }, { text: "Pricing" }]);
    const { last } = await post(pptx, PPTX, { presentation: "AVATAR" });
    expect(last.type).toBe("done");
    expect(mocks.rewriteAsSpokenScript.mock.calls[0][0]).toBe("Welcome\nSay hello warmly");
    expect(mocks.storeSlideImage).not.toHaveBeenCalled();
    const scenes = mocks.importScenesFromDocument.mock.calls[0][3];
    expect(scenes.map((s: { title: string; kind: string; slideImageId: string | null }) => [s.title, s.kind, s.slideImageId])).toEqual([
      ["Slide 1", "AVATAR", null],
      ["Slide 2", "AVATAR", null],
    ]);
  });

  it("refuses Slide + narration for a PowerPoint instead of silently importing avatars", async () => {
    const { res, json } = await post(await makePptx([{ text: "Hi" }]), PPTX, { presentation: "SLIDE" });
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/only be made from PDF files/);
    expect(mocks.importScenesFromDocument).not.toHaveBeenCalled();
  });

  it("refuses a zip that would expand a slide to an unreasonable size", async () => {
    const huge = await makePptx([{ text: "x".repeat(6 * 1024 * 1024) }]);
    const { res, json } = await post(huge, PPTX, { presentation: "AVATAR" });
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/unusually large/);
  });
});

describe("request checks", () => {
  it("requires sign-in", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requireUserId.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const { res } = await post(makePdf(["One"]), PDF);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown presentation value", async () => {
    const { res } = await post(makePdf(["One"]), PDF, { presentation: "PIP" });
    expect(res.status).toBe(422);
  });

  it("rejects content that isn't really a PDF", async () => {
    const { res, json } = await post(Buffer.from("not a pdf"), PDF, { presentation: "SLIDE" });
    expect(res.status).toBe(422);
    expect(json.error).toMatch(/Couldn't read that PDF/);
  });
});
