'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import styles from '../RepositoryExplorer.module.css';
import type { ViewerControls } from './DocumentViewerToolbar';

type Props = {
  previewUrl: string;
  fileName: string;
  controls: ViewerControls;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

export function DocxPreviewViewer({
  previewUrl,
  fileName,
  controls,
  viewerRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
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
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        if (!cancelled) setLoading(false);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Word preview failed.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, [previewUrl]);

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
        <div ref={hostRef} className={styles.docxHost} />
      </div>
    </div>
  );
}
