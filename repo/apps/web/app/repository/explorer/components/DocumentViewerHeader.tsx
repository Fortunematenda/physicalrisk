'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Download, ExternalLink, FileText, Maximize2, MoreVertical, PanelRight, X,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { formatBytes } from '@/lib/api';
import styles from '../RepositoryExplorer.module.css';
import { fileTypeLabel } from '../helpers';
import type { SelectedDocument, TreeEntry, VersionItem } from '../types';

type Props = {
  entry: TreeEntry;
  selectedDocument: SelectedDocument;
  version: VersionItem;
  onOpenInNewTab: () => void;
  onDownload: () => void;
  onFullscreen: () => void;
  onDelete?: () => void;
  onOpenDetailsPanel?: () => void;
  showDetailsButton?: boolean;
};

export function DocumentViewerHeader({
  entry,
  selectedDocument,
  version,
  onOpenInNewTab,
  onDownload,
  onFullscreen,
  onDelete,
  onOpenDetailsPanel,
  showDetailsButton,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuWrapRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const secondary = [
    selectedDocument.code,
    version.versionNo,
    fileTypeLabel(version.mimeType, version.originalFileName),
    formatBytes(version.fileSize),
  ].filter(Boolean).join(' · ');

  return (
    <header className={styles.docHeader}>
      <div className={styles.docHeaderLeft}>
        <span className={styles.docHeaderIconPdf} aria-hidden>
          <FileText size={18} />
        </span>
        <div className={styles.docHeaderText}>
          <h2 className={styles.docTitle} title={version.originalFileName || entry.name}>
            {version.originalFileName || entry.name}
          </h2>
          <div className={styles.docMetaLine}>
            <span>{secondary}</span>
            <StatusBadge value={version.approvalStatus || selectedDocument.status} />
          </div>
        </div>
      </div>
      <div className={styles.docHeaderActions}>
        {showDetailsButton ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onOpenDetailsPanel}
            aria-label="Open document details"
            title="Details"
          >
            <PanelRight size={15} />
          </button>
        ) : null}
        <button
          type="button"
          className={styles.iconButton}
          onClick={onOpenInNewTab}
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLink size={15} />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonPrimary}`}
          onClick={onDownload}
          aria-label="Download"
          title="Download"
        >
          <Download size={15} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onFullscreen}
          aria-label="Enter full screen"
          title="Full screen"
        >
          <Maximize2 size={16} />
        </button>
        <div className={styles.menuWrap} ref={menuWrapRef}>
          <button
            type="button"
            className={`${styles.iconButton} ${menuOpen ? styles.iconButtonActive : ''}`}
            aria-label="More document actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="More actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={17} />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <Link
                role="menuitem"
                href={`/repository/documents/${selectedDocument.id}`}
                className={styles.menuLink}
                onClick={() => setMenuOpen(false)}
              >
                Open document details
              </Link>
              <Link
                role="menuitem"
                href={`/documents/${selectedDocument.id}#versions`}
                className={styles.menuLink}
                onClick={() => setMenuOpen(false)}
              >
                View version history
              </Link>
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuDanger}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  Delete file
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SheetCloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className={styles.iconButton} onClick={onClick} aria-label={label} title={label}>
      <X size={16} />
    </button>
  );
}
