import { describe, expect, it } from "vitest";
import PptxGenJS from "pptxgenjs";
import { extractPptxSlideTexts } from "@/lib/pptx-extract";

// pptxgenjs (dev-only) builds a real, valid .pptx in memory so this test
// exercises the actual zip/XML shape PowerPoint produces, not a hand-rolled
// fixture — the extractor is unzip-and-parse logic, so a fake shape could
// pass against itself without proving anything about a real file.
async function buildTestPptx(): Promise<Buffer> {
  const pptx = new PptxGenJS();

  const slide1 = pptx.addSlide();
  slide1.addText("Welcome to YouMimic", { x: 1, y: 1, fontSize: 32 });
  slide1.addText("AI avatar videos made simple", { x: 1, y: 2, fontSize: 18 });
  slide1.addNotes("Hi everyone, thanks for joining. Today I'll walk you through YouMimic.");

  const slide2 = pptx.addSlide();
  slide2.addText("Our Pricing", { x: 1, y: 1, fontSize: 32 });
  slide2.addText("Small Business: $499/month", { x: 1, y: 2, fontSize: 18 });
  // Deliberately no notes, to cover the "no notesSlide file" path.

  // Deliberately no text at all, to cover the blank-slide path.
  pptx.addSlide();

  const data = await pptx.write({ outputType: "nodebuffer" });
  return data as Buffer;
}

describe("extractPptxSlideTexts", () => {
  it("extracts slide text and appends that slide's speaker notes, in slide order", async () => {
    const slides = await extractPptxSlideTexts(await buildTestPptx());
    expect(slides).toHaveLength(3);
    expect(slides[0]).toContain("Welcome to YouMimic");
    expect(slides[0]).toContain("AI avatar videos made simple");
    expect(slides[0]).toContain("Hi everyone, thanks for joining. Today I'll walk you through YouMimic.");
  });

  it("returns slide text with no notes appended when a slide has none", async () => {
    const slides = await extractPptxSlideTexts(await buildTestPptx());
    expect(slides[1]).toContain("Our Pricing");
    expect(slides[1]).toContain("Small Business: $499/month");
  });

  it("returns an empty string for a slide with no text and no notes", async () => {
    const slides = await extractPptxSlideTexts(await buildTestPptx());
    expect(slides[2].trim()).toBe("");
  });
});
