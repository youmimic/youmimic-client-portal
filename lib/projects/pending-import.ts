// Hands a document picked outside a project (the dashboard home's "PDF or
// PowerPoint to video" button) to the project editor it then opens. Kept in
// browser memory only: Next.js client navigation keeps this module loaded,
// and a File can't go in a URL. A full page reload simply drops it, and the
// editor opens as an ordinary new draft.

// Same limits the import route enforces, checked first so a wrong file never
// leaves an empty draft project behind.
export const IMPORT_DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export const IMPORT_DOCUMENT_ACCEPT = `${IMPORT_DOCUMENT_TYPES.join(",")},.pdf,.pptx`;
export const IMPORT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

export function importDocumentProblem(file: File): string | null {
  if (!IMPORT_DOCUMENT_TYPES.includes(file.type)) return "Only PDF or PowerPoint (.pptx) files are supported.";
  if (file.size > IMPORT_DOCUMENT_MAX_BYTES) return "That file is too large (max 15MB).";
  return null;
}

let pending: { projectId: string; file: File } | null = null;

export function setPendingDocumentImport(projectId: string, file: File): void {
  pending = { projectId, file };
}

// Read without clearing, so React's development double call of a state
// initialiser sees it both times; the editor clears it in an effect.
export function peekPendingDocumentImport(projectId: string): File | null {
  return pending && pending.projectId === projectId ? pending.file : null;
}

export function clearPendingDocumentImport(projectId: string): void {
  if (pending?.projectId === projectId) pending = null;
}
