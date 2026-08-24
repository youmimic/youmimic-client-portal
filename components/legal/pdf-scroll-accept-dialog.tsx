"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Bundled by Next's build (served same-origin from /_next/static/...) rather
// than react-pdf's default of fetching the worker from a CDN — the app's CSP
// (next.config.ts) only allows script/worker sources from 'self' plus the
// Calendly domains, so a CDN-hosted worker would be silently blocked.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Tolerance for "reached the bottom" — exact-zero distance is unreliable
// across browsers/zoom levels due to subpixel scroll rounding.
const BOTTOM_THRESHOLD_PX = 24;

interface PdfScrollAcceptDialogProps {
  title: string;
  fileUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

export function PdfScrollAcceptDialog({
  title,
  fileUrl,
  open,
  onOpenChange,
  onAccept,
}: PdfScrollAcceptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Scroll to the end of the document to enable Accept.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted fresh each time the dialog opens (rather than reset via
            an effect) — a brand-new instance means brand-new initial state,
            so re-opening after closing without finishing always restarts
            the scroll requirement. Also means the PDF isn't fetched/parsed
            until the user actually opens the dialog. */}
        {open && (
          <PdfAcceptBody
            fileUrl={fileUrl}
            onAccept={onAccept}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PdfAcceptBody({
  fileUrl,
  onAccept,
  onOpenChange,
}: {
  fileUrl: string;
  onAccept: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [renderedPages, setRenderedPages] = useState(0);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.floor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const allPagesRendered = numPages !== null && renderedPages >= numPages;

  // Covers the case where the document is short enough to fit without any
  // scrolling at all — no scroll event would ever fire, so this also checks
  // once every page has finished rendering and laying out.
  useEffect(() => {
    if (!allPagesRendered) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight <= BOTTOM_THRESHOLD_PX) {
      setReachedBottom(true);
    }
  }, [allPagesRendered]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= BOTTOM_THRESHOLD_PX) {
      setReachedBottom(true);
    }
  }

  const canAccept = allPagesRendered && reachedBottom;

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: loadedNumPages }) =>
            setNumPages(loadedNumPages)
          }
          loading={
            <p className="p-6 text-center text-sm text-muted-foreground">
              Loading document…
            </p>
          }
          error={
            <p className="p-6 text-center text-sm text-destructive">
              Failed to load the document. Please try again.
            </p>
          }
        >
          {numPages !== null &&
            containerWidth > 0 &&
            Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i + 1}
                pageNumber={i + 1}
                width={containerWidth}
                className="border-b last:border-b-0"
                onRenderSuccess={() => setRenderedPages((count) => count + 1)}
              />
            ))}
        </Document>
      </div>

      <DialogFooter>
        <Button
          type="button"
          onClick={() => {
            onAccept();
            onOpenChange(false);
          }}
          disabled={!canAccept}
        >
          {canAccept ? "Accept" : "Read till the end to accept"}
        </Button>
      </DialogFooter>
    </>
  );
}
