// Turns the pages/slides of an imported document into the scenes to create.
// Pure (no I/O), so the rules are easy to test:
//  - a page whose narration was split (a dense slide) becomes several
//    scenes, "Slide 4 · Part 1", "Slide 4 · Part 2", all showing the same
//    slide image and keeping the original page number;
//  - a page with an image but no text (a picture, a chart, a scanned page)
//    is kept with empty narration for the user to write. Nothing is made up
//    for it: there's no OCR or image description;
//  - a page with neither text nor an image is skipped.

export type ImportPresentation = "AVATAR" | "SLIDE";

export type ImportedPage = {
  // Narration for this page, already rewritten by AI or the raw text as a
  // fallback. Empty (or all blank) when the page has no text.
  scripts: string[];
  slideImageId: string | null;
};

export type ImportedScene = {
  title: string;
  script: string;
  kind: ImportPresentation;
  slideImageId: string | null;
  sourcePageNumber: number;
};

export function planImportedScenes(
  pages: ImportedPage[],
  label: "Page" | "Slide",
  presentation: ImportPresentation,
): { scenes: ImportedScene[]; pagesSkipped: number; scenesNeedingNarration: number } {
  const scenes: ImportedScene[] = [];
  let pagesSkipped = 0;
  let scenesNeedingNarration = 0;

  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    const parts = page.scripts.map((s) => s.trim()).filter(Boolean);
    const base = { kind: presentation, slideImageId: page.slideImageId, sourcePageNumber: pageNumber };

    if (parts.length === 0) {
      if (!page.slideImageId) {
        pagesSkipped += 1;
        return;
      }
      scenes.push({ ...base, title: `${label} ${pageNumber}`, script: "" });
      scenesNeedingNarration += 1;
      return;
    }

    parts.forEach((script, part) => {
      scenes.push({
        ...base,
        title: parts.length > 1 ? `${label} ${pageNumber} · Part ${part + 1}` : `${label} ${pageNumber}`,
        script,
      });
    });
  });

  return { scenes, pagesSkipped, scenesNeedingNarration };
}
