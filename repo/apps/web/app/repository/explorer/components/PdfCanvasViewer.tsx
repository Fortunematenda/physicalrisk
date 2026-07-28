'use client';

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import styles from '../RepositoryExplorer.module.css';
import type { ViewerControls } from './DocumentViewerToolbar';

type Props = {
  previewUrl: string;
  fileName: string;
  controls: ViewerControls;
  onPageCount: (count: number) => void;
  onPageChange: (page: number) => void;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // CDN worker avoids Next/webpack path issues in Docker standalone builds.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

export function PdfCanvasViewer({
  previewUrl,
  fileName,
  controls,
  onPageCount,
  onPageChange,
  viewerRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setError('');
    setThumbs([]);
    pdfRef.current = null;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument(previewUrl);
        const pdf = await task.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        onPageCountRef.current(pdf.numPages);

        const nextThumbs: string[] = [];
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
          const page = await pdf.getPage(pageNo);
          const viewport = page.getViewport({ scale: 0.22 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          nextThumbs.push(canvas.toDataURL('image/jpeg', 0.72));
        }
        if (!cancelled) setThumbs(nextThumbs);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'PDF could not be rendered.');
          onPageCountRef.current(0);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();

    return () => {
      cancelled = true;
      void pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    const renderPage = async () => {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!pdf || !canvas || !container || loadingDoc) return;
      const pageNumber = Math.min(Math.max(1, controls.page), pdf.numPages || 1);
      try {
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1, rotation: controls.rotate });
        const available = Math.max(280, container.clientWidth - 48);
        let scale = 1;
        if (controls.zoom === 'page-width') scale = available / base.width;
        else if (controls.zoom === 'page-fit') {
          const availableH = Math.max(360, container.clientHeight - 48);
          scale = Math.min(available / base.width, availableH / base.height);
        } else scale = controls.zoom / 100;

        const viewport = page.getViewport({ scale, rotation: controls.rotate });
        const context = canvas.getContext('2d');
        if (!context || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setError('Page could not be rendered.');
      }
    };
    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [controls.page, controls.zoom, controls.rotate, loadingDoc, previewUrl]);

  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (viewerRef) (viewerRef as MutableRefObject<HTMLDivElement | null>).current = node;
  };

  if (error) {
    return <div className={styles.previewUnavailable}><span>{error}</span></div>;
  }

  return (
    <div className={styles.pdfViewerShell}>
      <div className={styles.previewCanvas} ref={setRefs}>
        {loadingDoc ? (
          <div className={styles.previewLoading} aria-busy="true">Loading document preview…</div>
        ) : (
          <div className={styles.previewPage}>
            <canvas ref={canvasRef} className={styles.pdfCanvas} aria-label={fileName} />
          </div>
        )}
      </div>
      {thumbs.length > 0 ? (
        <div className={styles.thumbStrip} role="tablist" aria-label="Page thumbnails">
          {thumbs.map((src, index) => {
            const page = index + 1;
            const active = page === controls.page;
            return (
              <button
                key={page}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Page ${page}`}
                className={`${styles.thumb} ${active ? styles.thumbActive : ''}`}
                onClick={() => onPageChange(page)}
              >
                <img src={src} alt="" />
                <span>{page}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
