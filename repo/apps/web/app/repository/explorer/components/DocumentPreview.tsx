'use client';

import { useCallback, type RefObject } from 'react';
import { FileText } from 'lucide-react';
import styles from '../RepositoryExplorer.module.css';
import {
  isDocx, isImage, isInlineType, isPdf, isSpreadsheet, isTextPreview, isZipArchive,
} from '../helpers';
import type { VersionItem } from '../types';
import type { ViewerControls } from './DocumentViewerToolbar';
import { DocxPreviewViewer } from './DocxPreviewViewer';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import { SpreadsheetPreviewViewer } from './SpreadsheetPreviewViewer';
import { TextPreviewViewer } from './TextPreviewViewer';

type Props = {
  version: VersionItem;
  previewUrl: string | null;
  loading: boolean;
  error: string;
  controls: ViewerControls;
  onPageCount: (count: number) => void;
  onPageChange: (page: number) => void;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

export function DocumentPreview({
  version,
  previewUrl,
  loading,
  error,
  controls,
  onPageCount,
  onPageChange,
  viewerRef,
}: Props) {
  const handlePageCount = useCallback((count: number) => {
    onPageCount(count);
  }, [onPageCount]);

  if (isZipArchive(version)) {
    return (
      <div className={styles.previewUnavailable}>
        <FileText size={22} />
        <span>
          This ZIP was stored without extraction. Use Open or Download to save it to your computer.
        </span>
      </div>
    );
  }

  if (!isInlineType(version.mimeType, version.originalFileName)) {
    return (
      <div className={styles.previewUnavailable}>
        <FileText size={22} />
        <span>
          No inline preview for this file type yet. Use Open in new tab or Download.
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.previewLoading} aria-busy="true">
        Loading document preview…
      </div>
    );
  }

  if (error || !previewUrl) {
    return (
      <div className={styles.previewUnavailable}>
        <span>{error || 'Preview is not available.'}</span>
      </div>
    );
  }

  // PDF must remain the primary viewer when the file is a PDF.
  if (isPdf(version)) {
    return (
      <PdfCanvasViewer
        previewUrl={previewUrl}
        fileName={version.originalFileName}
        controls={controls}
        onPageCount={handlePageCount}
        onPageChange={onPageChange}
        viewerRef={viewerRef}
      />
    );
  }

  if (isDocx(version)) {
    return (
      <DocxPreviewViewer
        previewUrl={previewUrl}
        fileName={version.originalFileName}
        controls={controls}
        onPageCount={handlePageCount}
        viewerRef={viewerRef}
      />
    );
  }

  if (isSpreadsheet(version)) {
    return (
      <SpreadsheetPreviewViewer
        previewUrl={previewUrl}
        fileName={version.originalFileName}
        controls={controls}
        viewerRef={viewerRef}
      />
    );
  }

  if (isTextPreview(version)) {
    return (
      <TextPreviewViewer
        previewUrl={previewUrl}
        fileName={version.originalFileName}
        controls={controls}
        viewerRef={viewerRef}
      />
    );
  }

  if (isImage(version)) {
    return (
      <div className={styles.previewCanvas} ref={viewerRef}>
        <div className={styles.previewPage}>
          <img
            src={previewUrl}
            alt={`Preview of ${version.originalFileName}`}
            className={styles.previewImage}
            style={{
              transform: `rotate(${controls.rotate}deg) scale(${
                typeof controls.zoom === 'number' ? controls.zoom / 100 : 1
              })`,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewUnavailable}>
      <FileText size={22} />
      <span>No inline preview for this file type yet. Use Open in new tab or Download.</span>
    </div>
  );
}
