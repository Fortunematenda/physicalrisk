'use client';

import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCw, ZoomIn, ZoomOut,
} from 'lucide-react';
import styles from '../RepositoryExplorer.module.css';

export type ViewerControls = {
  page: number;
  pageCount: number | null;
  zoom: number | 'page-width' | 'page-fit';
  rotate: number;
  fullscreen: boolean;
};

type Props = {
  controls: ViewerControls;
  pdfSupported: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number | 'page-width' | 'page-fit') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onToggleFullscreen: () => void;
};

function zoomSelectValue(zoom: ViewerControls['zoom']) {
  if (zoom === 'page-width' || zoom === 'page-fit') return zoom;
  return String(zoom);
}

export function DocumentViewerToolbar({
  controls,
  pdfSupported,
  onPageChange,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onRotate,
  onToggleFullscreen,
}: Props) {
  const pageCountUnknown = controls.pageCount == null || controls.pageCount < 1;
  const atFirst = controls.page <= 1;
  const atLast = controls.pageCount != null && controls.pageCount > 0 && controls.page >= controls.pageCount;
  const numericZoom = typeof controls.zoom === 'number' ? controls.zoom : 100;

  return (
    <div className={styles.viewerToolbar} role="toolbar" aria-label="Document viewer controls">
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={() => onPageChange(controls.page - 1)}
          disabled={!pdfSupported || atFirst}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className={styles.pageIndicator} aria-live="polite">
          {pdfSupported
            ? (pageCountUnknown ? `${controls.page} / —` : `${controls.page} / ${controls.pageCount}`)
            : '—'}
        </span>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={() => onPageChange(controls.page + 1)}
          disabled={!pdfSupported || atLast}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className={styles.toolbarDivider} aria-hidden />

      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={onZoomOut}
          disabled={!pdfSupported || numericZoom <= 50}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <ZoomOut size={15} />
        </button>
        <span className={styles.zoomIndicator}>
          {typeof controls.zoom === 'number' ? `${controls.zoom}%` : controls.zoom === 'page-fit' ? 'Fit' : 'Fit W'}
        </span>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={onZoomIn}
          disabled={!pdfSupported || numericZoom >= 300}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <ZoomIn size={15} />
        </button>
        <select
          className={styles.fitSelect}
          aria-label="Fit mode"
          title="Fit mode"
          disabled={!pdfSupported}
          value={zoomSelectValue(controls.zoom)}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'page-width' || value === 'page-fit') onZoomChange(value);
            else onZoomChange(Number(value));
          }}
        >
          <option value="page-width">Fit width</option>
          <option value="page-fit">Fit page</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
          <option value="200">200%</option>
        </select>
      </div>

      <div className={styles.toolbarDivider} aria-hidden />

      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={onRotate}
          disabled={!pdfSupported}
          aria-label="Rotate clockwise"
          title="Rotate"
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          className={styles.iconButtonSm}
          onClick={onToggleFullscreen}
          aria-label={controls.fullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={controls.fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {controls.fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  );
}
