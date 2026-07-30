'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import styles from '../RepositoryExplorer.module.css';
import type { ViewerControls } from './DocumentViewerToolbar';

type Props = {
  previewUrl: string;
  fileName: string;
  controls: ViewerControls;
  onPageCount: (count: number) => void;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

function pageSections(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.docx-wrapper > section.docx'));
}

export function DocxPreviewViewer({
  previewUrl,
  fileName,
  controls,
  onPageCount,
  viewerRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const zoom = typeof controls.zoom === 'number' ? controls.zoom / 100 : 1;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    host.innerHTML = '';
    onPageCountRef.current(0);

    (async () => {
      try {
        const response = await fetch(previewUrl);
        if (!response.ok) throw new Error('Document could not be loaded.');
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const { renderAsync } = await import('docx-preview');
        await renderAsync(buffer, host, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          // Word inserts lastRenderedPageBreak markers — honour them so multi-page docs split.
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        if (cancelled) return;

        const pages = pageSections(host);
        const total = Math.max(1, pages.length);
        onPageCountRef.current(total);
        pages.forEach((section, index) => {
          section.dataset.docxPage = String(index + 1);
          section.hidden = index !== 0;
        });
        setLoading(false);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Word preview failed.');
          onPageCountRef.current(0);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, [previewUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || loading) return;
    const pages = pageSections(host);
    if (!pages.length) return;
    const total = pages.length;
    onPageCountRef.current(total);
    const active = Math.min(Math.max(1, controls.page), total);
    pages.forEach((section, index) => {
      section.hidden = index + 1 !== active;
    });
    // Keep the active page in view inside the scrollable preview pane.
    pages[active - 1]?.scrollIntoView({ block: 'nearest' });
  }, [controls.page, loading]);

  if (error) {
    return (
      <div className={styles.previewUnavailable}>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className={styles.previewCanvas} ref={viewerRef}>
      {loading ? (
        <div className={styles.previewLoading} aria-busy="true">
          Rendering Word document…
        </div>
      ) : null}
      <div
        className={styles.docxStage}
        style={{
          display: loading ? 'none' : undefined,
          transform: `rotate(${controls.rotate}deg) scale(${zoom})`,
          transformOrigin: 'top center',
        }}
        aria-label={`Preview of ${fileName}`}
      >
        <div ref={hostRef} className={`${styles.docxHost} ${styles.docxPaged}`} />
      </div>
    </div>
  );
}
