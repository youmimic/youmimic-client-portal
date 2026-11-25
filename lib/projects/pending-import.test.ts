import { describe, expect, it } from "vitest";
import {
  IMPORT_DOCUMENT_MAX_BYTES,
  importDocumentProblem,
  clearPendingDocumentImport,
  peekPendingDocumentImport,
  setPendingDocumentImport,
} from "@/lib/projects/pending-import";

const file = (type: string, size = 10) => new File([new Uint8Array(size)], "deck", { type });

describe("pending document import", () => {
  it("hands the file only to the project it was picked for, until cleared", () => {
    const pdf = file("application/pdf");
    setPendingDocumentImport("p1", pdf);
    expect(peekPendingDocumentImport("other")).toBeNull();
    expect(peekPendingDocumentImport("p1")).toBe(pdf);
    expect(peekPendingDocumentImport("p1")).toBe(pdf);
    clearPendingDocumentImport("other");
    expect(peekPendingDocumentImport("p1")).toBe(pdf);
    clearPendingDocumentImport("p1");
    expect(peekPendingDocumentImport("p1")).toBeNull();
  });

  it("checks type and size like the import route", () => {
    expect(importDocumentProblem(file("application/pdf"))).toBeNull();
    expect(importDocumentProblem(file("application/vnd.openxmlformats-officedocument.presentationml.presentation"))).toBeNull();
    expect(importDocumentProblem(file("application/msword"))).toMatch(/PDF or PowerPoint/);
    expect(importDocumentProblem(file("application/pdf", IMPORT_DOCUMENT_MAX_BYTES + 1))).toMatch(/too large/);
  });
});
