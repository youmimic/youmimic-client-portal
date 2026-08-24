"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check } from "lucide-react";

// react-pdf (via pdfjs-dist) references browser-only globals like DOMMatrix
// at module scope, which crashes Next's server-side render of this page —
// ssr: false defers loading this module to the client entirely, where those
// globals actually exist.
const PdfScrollAcceptDialog = dynamic(
  () =>
    import("@/components/legal/pdf-scroll-accept-dialog").then(
      (mod) => mod.PdfScrollAcceptDialog,
    ),
  { ssr: false },
);

interface LegalAcceptanceFieldProps {
  label: string;
  fileUrl: string;
  accepted: boolean;
  onAccept: () => void;
  error?: string;
}

// Replaces the old pattern of "open the PDF in a new tab + tick a checkbox"
// with a single action: open the document in-app, scroll to the end, accept.
// Shared by app/signup/signup-form.tsx and app/invite/[token]/join/join-form.tsx.
export function LegalAcceptanceField({
  label,
  fileUrl,
  accepted,
  onAccept,
  error,
}: LegalAcceptanceFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border p-4" data-invalid={!!error}>
      {accepted ? (
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
          <span className="font-medium">{label} accepted</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-muted-foreground underline underline-offset-4 hover:text-primary"
          >
            view again
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-medium underline underline-offset-4 hover:text-primary"
          >
            Review and accept the {label}
          </button>
          <p className="text-sm text-muted-foreground">
            You must scroll to the end of the {label} and accept it before
            continuing.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm font-medium text-destructive">{error}</p>
      )}

      <PdfScrollAcceptDialog
        title={label}
        fileUrl={fileUrl}
        open={open}
        onOpenChange={setOpen}
        onAccept={onAccept}
      />
    </div>
  );
}
