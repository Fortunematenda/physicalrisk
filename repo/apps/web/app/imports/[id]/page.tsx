'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, FileText, FolderOpen, MapPin, AlertTriangle,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { api, formatBytes, formatDate } from '@/lib/api';
import styles from './ImportResult.module.css';

type ImportJobDetail = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  status: string;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  metadata?: {
    title?: string;
    documentCode?: string;
    documentType?: string;
    versionNo?: string;
    description?: string;
    owner?: string;
    approvalStatus?: string;
    approvedBy?: string;
    approvalDate?: string;
    mode?: string;
    sectionKey?: string;
  } | null;
  routingDecision?: {
    projectCode?: string;
    sectionKey?: string;
    sectionName?: string;
    configured?: boolean;
  } | null;
  storageResult?: {
    mode?: string;
    repositoryPath?: string;
    registers?: { documents?: unknown; versions?: unknown };
  } | null;
  project?: { id: string; code: string; name: string; repositoryRootPath?: string | null } | null;
  sourceSystem?: { id: string; name: string; type?: string | null } | null;
  resolvedSection?: { id: string; name: string; sectionKey: string; position?: number } | null;
  document?: { id: string; code: string; title: string; documentType?: string; currentVersionNo?: string } | null;
  version?: {
    id: string;
    versionNo: string;
    originalFileName?: string;
    storagePath?: string;
    approvalStatus?: string;
    approvedBy?: string;
    approvalDate?: string;
    isCurrent?: boolean;
  } | null;
  initiatedBy?: { id: string; name: string; email?: string } | null;
};

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  const display = value?.trim() ? value : '—';
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldValue} ${mono ? styles.mono : ''}`}>{display}</span>
    </div>
  );
}

export default function ImportResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ImportJobDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<ImportJobDetail>(`/imports/${id}`)
      .then(setItem)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load import detail.'));
  }, [id]);

  const meta = item?.metadata ?? {};
  const storage = item?.storageResult ?? null;
  const routing = item?.routingDecision ?? null;
  const isFailed = item?.status === 'FAILED';
  const isImported = item?.status === 'IMPORTED';

  const statusTone = useMemo(() => {
    if (!item) return styles.heroNeutral;
    if (item.status === 'IMPORTED') return styles.heroSuccess;
    if (item.status === 'FAILED') return styles.heroError;
    return styles.heroNeutral;
  }, [item]);

  if (!item && !error) return <Loading />;

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backLink} onClick={() => router.back()}>
        <ArrowLeft size={14} /> Back
      </button>

      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Import detail</h1>
          <p>Review validation, placement, storage, and version outcome for this import.</p>
        </div>
        {item ? <StatusBadge value={item.status} /> : null}
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {item ? (
        <>
          <section className={`${styles.hero} ${statusTone}`}>
            <div className={styles.heroIcon}>
              {isFailed ? <AlertTriangle size={22} /> : <FileText size={22} />}
            </div>
            <div className={styles.heroBody}>
              <h2>{item.fileName}</h2>
              <p>
                {[
                  item.project ? `${item.project.code} — ${item.project.name}` : null,
                  item.sourceSystem?.name,
                  formatBytes(item.fileSize ?? undefined),
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className={styles.heroMeta}>
              <span>Started</span>
              <strong>{formatDate(item.startedAt)}</strong>
              <span>Completed</span>
              <strong>{formatDate(item.completedAt)}</strong>
            </div>
          </section>

          {item.errorMessage ? (
            <div className={`notice error ${styles.errorBanner}`}>{item.errorMessage}</div>
          ) : null}

          <div className={styles.layout}>
            <div className={styles.main}>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>Document</h3>
                  <p>Identity captured for this import.</p>
                </div>
                <div className={styles.grid2}>
                  <Field label="Title" value={meta.title || item.document?.title} />
                  <Field label="Document code" value={meta.documentCode || item.document?.code} />
                  <Field label="Document type" value={meta.documentType || item.document?.documentType} />
                  <Field label="Version" value={item.version?.versionNo || meta.versionNo} />
                  <Field label="Owner" value={meta.owner} />
                  <Field label="Import mode" value={meta.mode === 'NEW_VERSION' ? 'New version' : 'New document'} />
                  <div className={styles.spanFull}>
                    <Field label="Description" value={meta.description} />
                  </div>
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>Approval</h3>
                  <p>Recorded against the importing session.</p>
                </div>
                <div className={styles.grid3}>
                  <Field label="Status" value={item.version?.approvalStatus || meta.approvalStatus || 'APPROVED'} />
                  <Field label="Approved by" value={item.version?.approvedBy || meta.approvedBy} />
                  <Field
                    label="Approval date"
                    value={
                      item.version?.approvalDate
                        ? formatDate(item.version.approvalDate)
                        : meta.approvalDate
                          ? formatDate(meta.approvalDate)
                          : null
                    }
                  />
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>File</h3>
                  <p>Source file received by the gateway.</p>
                </div>
                <div className={styles.grid2}>
                  <Field label="File name" value={item.fileName} />
                  <Field label="Size" value={formatBytes(item.fileSize ?? undefined)} />
                  <Field label="MIME type" value={item.mimeType} />
                  <Field label="Checksum" value={item.checksum} mono />
                </div>
              </section>
            </div>

            <aside className={styles.aside}>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>Repository outcome</h3>
                </div>
                {item.document ? (
                  <div className={styles.outcome}>
                    <div className={styles.outcomeIcon}>
                      {isImported ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                    </div>
                    <div>
                      <strong>{item.document.code}</strong>
                      <p>{item.document.title}</p>
                      {(item.version?.versionNo || item.document.currentVersionNo) ? (
                        <span className={styles.chip}>
                          Version {item.version?.versionNo || item.document.currentVersionNo}
                          {item.version?.isCurrent ? ' · Current' : ''}
                        </span>
                      ) : null}
                    </div>
                    <Link className={`button primary ${styles.fullButton}`} href={`/documents/${item.document.id}`}>
                      View document
                    </Link>
                  </div>
                ) : (
                  <p className={styles.empty}>No document record was created for this import.</p>
                )}
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>Placement</h3>
                </div>
                <div className={styles.stack}>
                  <div className={styles.stackRow}>
                    <MapPin size={15} />
                    <div>
                      <span className={styles.fieldLabel}>Section</span>
                      <strong>
                        {item.resolvedSection?.name
                          || routing?.sectionName
                          || 'Not resolved'}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.stackRow}>
                    <FolderOpen size={15} />
                    <div>
                      <span className={styles.fieldLabel}>Storage path</span>
                      <strong className={styles.mono}>
                        {storage?.repositoryPath
                          || item.version?.storagePath
                          || 'Not stored'}
                      </strong>
                    </div>
                  </div>
                  <div className={styles.stackRow}>
                    <FileText size={15} />
                    <div>
                      <span className={styles.fieldLabel}>Storage mode</span>
                      <strong>{storage?.mode?.replaceAll('_', ' ') || '—'}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>Context</h3>
                </div>
                <div className={styles.stack}>
                  <Field label="Project" value={item.project ? `${item.project.code} — ${item.project.name}` : null} />
                  <Field
                    label="Source system"
                    value={
                      item.sourceSystem
                        ? `${item.sourceSystem.name}${item.sourceSystem.type ? ` · ${item.sourceSystem.type}` : ''}`
                        : null
                    }
                  />
                  <Field label="Initiated by" value={item.initiatedBy?.name || 'System'} />
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
