'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Check, ChevronRight, Copy, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { formatBytes, formatDate } from '@/lib/api';
import styles from '../RepositoryExplorer.module.css';
import { fileTypeLabel, pathSegments } from '../helpers';
import type { SelectedDocument, VersionItem } from '../types';
import { SheetCloseButton } from './DocumentViewerHeader';

type Props = {
  selectedDocument: SelectedDocument;
  version: VersionItem;
  onClose?: () => void;
  showClose?: boolean;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.inspectorField}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LocationBlock({ path }: { path?: string | null }) {
  const segments = pathSegments(path);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!path) return <span className={styles.muted}>—</span>;

  return (
    <div className={styles.pathBlock}>
      <nav className={styles.pathBreadcrumbs} aria-label="Repository location" title={path}>
        {segments.map((segment, index) => (
          <span key={`${segment}-${index}`} className={styles.pathSegment}>
            {index > 0 ? <ChevronRight size={12} className={styles.pathSep} aria-hidden /> : null}
            <span className={styles.pathLink}>{segment}</span>
          </span>
        ))}
      </nav>
      <button type="button" className={styles.copyLocationBtn} onClick={() => void copy()}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy location'}
      </button>
    </div>
  );
}

export function DocumentDetailsInspector({
  selectedDocument,
  version,
  onClose,
  showClose,
}: Props) {
  return (
    <div className={styles.inspectorInner}>
      <div className={styles.inspectorHeader}>
        <h2>Document Details</h2>
        {showClose && onClose ? <SheetCloseButton onClick={onClose} label="Close details" /> : null}
      </div>
      <div className={styles.inspectorScroll}>
        <section className={styles.inspectorCard} aria-labelledby="inspector-file">
          <h3 id="inspector-file">File</h3>
          <dl className={styles.inspectorDl}>
            <Field label="Filename">{version.originalFileName}</Field>
            <Field label="File type">{fileTypeLabel(version.mimeType, version.originalFileName)}</Field>
            <Field label="File size">{formatBytes(version.fileSize)}</Field>
            <Field label="Modified">{formatDate(version.createdAt)}</Field>
          </dl>
        </section>

        <section className={styles.inspectorCard} aria-labelledby="inspector-document">
          <h3 id="inspector-document">Document</h3>
          <dl className={styles.inspectorDl}>
            <Field label="Document code">{selectedDocument.code}</Field>
            <Field label="Document title">{selectedDocument.title}</Field>
            <Field label="Version">{version.versionNo}</Field>
            <Field label="Status">
              <StatusBadge value={version.approvalStatus || selectedDocument.status} />
            </Field>
            <Field label="Parent document">
              <Link href={`/repository/documents/${selectedDocument.id}`} className={styles.parentLink}>
                {selectedDocument.code} — {selectedDocument.title}
              </Link>
            </Field>
          </dl>
          <Link href={`/repository/documents/${selectedDocument.id}`} className={styles.openDetailsBtn}>
            Open document details
            <ExternalLink size={14} />
          </Link>
        </section>

        <section className={styles.inspectorCard} aria-labelledby="inspector-repo">
          <h3 id="inspector-repo">Repository</h3>
          <dl className={styles.inspectorDl}>
            <Field label="Project">
              {selectedDocument.project.code} — {selectedDocument.project.name}
            </Field>
            <Field label="Module">{selectedDocument.section.name}</Field>
            <Field label="Location">
              <LocationBlock path={version.storagePath} />
            </Field>
          </dl>
        </section>
      </div>
    </div>
  );
}
