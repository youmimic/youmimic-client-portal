import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

// A .pptx is a zip of OOXML — slide text lives in ppt/slides/slideN.xml,
// speaker notes (when present) in ppt/notesSlides/notesSlideN.xml, both as
// <a:t> text runs. removeNSPrefix strips the "a:"/"p:" namespace prefixes,
// so every text run ends up under a plain "t" key regardless of its
// original tag — collectText below just walks the parsed tree for that key,
// which is simpler and more robust than matching exact shape/placeholder
// types (confirmed live: a blank "Slide Image Placeholder" shape and a
// missing notes file both resolve cleanly to no text, not an error).
function collectText(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectText(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "t") {
        if (typeof value === "string") out.push(value);
        else if (value && typeof value === "object" && "#text" in (value as object)) {
          out.push(String((value as { "#text": unknown })["#text"]));
        }
      } else {
        collectText(value, out);
      }
    }
  }
}

// One string per slide — slide text first, then that slide's speaker notes
// (if any) appended, so a presenter's prepared narration is included
// alongside the visible bullet points. Confirmed live against a real
// generated .pptx (slide with notes, slide without notes, and a blank
// slide) — the caller (importScenesFromDocument) already skips
// blank/whitespace-only entries, same as a blank PDF page.
// Zip-bomb guards. Only slide and notes XML is ever inflated, and each one
// is checked against the size the zip itself declares before inflating it.
// Real slide XML is a few hundred KB at most.
const MAX_XML_BYTES = 5 * 1024 * 1024;
export const MAX_PPTX_SLIDES = 200;

export class PptxLimitError extends Error {}

function declaredSize(file: JSZip.JSZipObject): number {
  // JSZip keeps the central directory's uncompressed size here; it isn't
  // part of the public types.
  return (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
}

async function readXml(file: JSZip.JSZipObject): Promise<string> {
  if (declaredSize(file) > MAX_XML_BYTES) throw new PptxLimitError("A slide in that file is unusually large.");
  const text = await file.async("string");
  if (text.length > MAX_XML_BYTES) throw new PptxLimitError("A slide in that file is unusually large.");
  return text;
}

export async function extractPptxSlideTexts(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

  const slideNums = Object.keys(zip.files)
    .map((name) => name.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  if (slideNums.length > MAX_PPTX_SLIDES) {
    throw new PptxLimitError(`That presentation has ${slideNums.length} slides, which is more than can be imported.`);
  }

  const results: string[] = [];
  for (const num of slideNums) {
    const slideFile = zip.file(`ppt/slides/slide${num}.xml`);
    if (!slideFile) continue;
    const slideTexts: string[] = [];
    collectText(parser.parse(await readXml(slideFile)), slideTexts);

    // Speaker notes feed the narration only. They're never part of the
    // slide image (only PDFs are rendered, and a PDF has no notes).
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
    const notesTexts: string[] = [];
    if (notesFile) {
      collectText(parser.parse(await readXml(notesFile)), notesTexts);
    }

    results.push([...slideTexts, ...notesTexts].join("\n"));
  }
  return results;
}
