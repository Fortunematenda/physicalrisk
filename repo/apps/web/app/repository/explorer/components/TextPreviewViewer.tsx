'use client';

import { useEffect, useState, type RefObject } from 'react';
import styles from '../RepositoryExplorer.module.css';
import type { ViewerControls } from './DocumentViewerToolbar';

type Props = {
  previewUrl: string;
  fileName: string;
  controls: ViewerControls;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

export function TextPreviewViewer({
  previewUrl,
  fileName,
  controls,
  viewerRef,
}: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const zoom = typeof controls.zoom === 'number' ? controls.zoom / 100 : 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setText('');

    (async () => {
      try {
        const response = await fetch(previewUrl);
        if (!response.ok) throw new Error('Document could not be loaded.');
        const body = await response.text();
        if (!cancelled) {
          setText(body);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Text preview failed.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <div className={styles.previewLoading} aria-busy="true">
        Loading document preview…
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.previewUnavailable}>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className={styles.previewCanvas} ref={viewerRef}>
      <div
        className={styles.textPreviewPage}
        style={{
          transform: `rotate(${controls.rotate}deg) scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        <pre className={styles.textPreview} aria-label={`Preview of ${fileName}`}>{text}</pre>
      </div>
    </div>
  );
}
