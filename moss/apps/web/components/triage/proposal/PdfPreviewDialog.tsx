'use client';

/**
 * Renders a PDF with pdf.js (canvas pages) so Preview never triggers the
 * browser's "download PDFs" behaviour that blob/iframe URLs hit.
 */

import { useEffect, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from 'pdfjs-dist';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfBytes: ArrayBuffer | null;
  title?: string;
  description?: string;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  downloadLabel?: string;
};

export function PdfPreviewDialog({
  open,
  onOpenChange,
  pdfBytes,
  title = 'Proposal preview',
  description = 'Live PDF preview. Use Download PDF if you need a file.',
  onDownload,
  downloadDisabled,
  downloadLabel = 'Download PDF',
}: Props) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pdfBytes) {
      setPages([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);

    (async () => {
      try {
        // Clone — pdf.js may transfer/detach the buffer.
        const data = pdfBytes.slice(0);
        const pdf = await getDocument({ data }).promise;
        const rendered: string[] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          rendered.push(canvas.toDataURL('image/png'));
        }
        if (!cancelled) setPages(rendered);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to render PDF preview.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, pdfBytes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-3">
          {loading ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="size-6 animate-spin" />
              Rendering preview…
            </div>
          ) : null}
          {error ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-700">
              <p className="m-0 font-medium">Preview failed</p>
              <p className="m-0 text-red-600/90">{error}</p>
              {onDownload ? (
                <Button type="button" className="mt-2" disabled={downloadDisabled} onClick={onDownload}>
                  <Download className="size-4" />
                  {downloadLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
          {!loading && !error && pages.length ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {pages.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`pdf-page-${index + 1}`}
                  src={src}
                  alt={`Page ${index + 1}`}
                  className="w-full rounded-sm border border-slate-200 bg-white shadow-sm"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            Close
          </Button>
          {onDownload ? (
            <Button type="button" disabled={downloadDisabled} onClick={onDownload}>
              <Download className="size-4" />
              {downloadLabel}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
