'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileText, FolderOpen, History, RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, API_URL, formatBytes, formatDate, getToken } from '@/lib/api';
import styles from './VersionRegister.module.css';

type VersionRow = {
  id: string;
  versionNo: string;
  originalFileName: string;
  fileSize: number;
  storagePath: string;
  approvalStatus: string;
  approvedBy: string;
  approvalDate: string;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: { name?: string } | null;
  document: {
    id: string;
    code: string;
    title: string;
    project?: { id: string; code: string; name: string };
    section?: { name: string };
  };
};

type ProjectRow = { id: string; code: string; name: string };

export default function VersionRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') ?? '';

  const [items, setItems] = useState<VersionRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [lifecycle, setLifecycle] = useState<'ALL' | 'CURRENT' | 'SUPERSEDED'>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = async (nextProjectId = projectId) => {
    setLoading(true);
    setError('');
    try {
      const path = nextProjectId ? `/version-register?projectId=${nextProjectId}` : '/version-register';
      setItems(await api<VersionRow[]>(path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load version register');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api<ProjectRow[]>('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    void load(projectId);
  }, [projectId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (lifecycle === 'CURRENT' && !item.isCurrent) return false;
      if (lifecycle === 'SUPERSEDED' && item.isCurrent) return false;
      if (!needle) return true;
      const haystack = [
        item.document.code,
        item.document.title,
        item.versionNo,
        item.originalFileName,
        item.approvedBy,
        item.storagePath,
        item.document.project?.code,
        item.document.section?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, lifecycle, query]);

  const stats = useMemo(() => {
    const current = items.filter((item) => item.isCurrent).length;
    return {
      total: items.length,
      current,
      superseded: items.length - current,
      shown: filtered.length,
    };
  }, [items, filtered.length]);

  const download = async (item: VersionRow) => {
    setDownloadingId(item.id);
    setError('');
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/versions/${item.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Version Register"
        description="Traceable history of every VPS-stored document version. Current releases are marked clearly and earlier versions stay retained."
        action={{ label: 'Master Document Index', href: '/repository/index' }}
      />

      {error ? <div className="notice error">{error}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTotal}`}><History size={18} /></div>
          <div>
            <span>Registered versions</span>
            <strong>{stats.total}</strong>
            <small>All retained releases</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconCurrent}`}><FileText size={18} /></div>
          <div>
            <span>Current</span>
            <strong>{stats.current}</strong>
            <small>Active approved files</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconSuperseded}`}><FolderOpen size={18} /></div>
          <div>
            <span>Superseded</span>
            <strong>{stats.superseded}</strong>
            <small>Preserved earlier versions</small>
          </div>
        </div>
      </div>

      <div className={`panel ${styles.panel}`}>
        <div className={styles.toolbar}>
          <select
            className={styles.select}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Filter by project"
            title="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} — {project.name}
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={lifecycle}
            onChange={(event) => setLifecycle(event.target.value as 'ALL' | 'CURRENT' | 'SUPERSEDED')}
            aria-label="Filter by lifecycle"
            title="Filter by lifecycle"
          >
            <option value="ALL">All lifecycles</option>
            <option value="CURRENT">Current only</option>
            <option value="SUPERSEDED">Superseded only</option>
          </select>

          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, title, file, approver or path"
              aria-label="Search version register"
            />
          </div>

          <button
            type="button"
            className={`button small ${styles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh version register"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>

          <span className={styles.count}>{stats.shown} shown</span>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}><Loading /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              title="No versions found"
              text={items.length === 0
                ? 'Import an approved document to start building the version register.'
                : 'No versions match the current filters. Clear search or change lifecycle.'}
            />
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Version</th>
                  <th>Approval</th>
                  <th>File</th>
                  <th>Lifecycle</th>
                  <th>Location</th>
                  <th>Imported</th>
                  <th className={styles.actionsHeading}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`clickable-row ${item.isCurrent ? styles.currentRow : ''}`}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open document ${item.document.code} version ${item.versionNo}`}
                    onClick={() => router.push(`/documents/${item.document.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/documents/${item.document.id}`);
                      }
                    }}
                  >
                    <td>
                      <Link
                        className={`primary-text mono ${styles.docLink}`}
                        href={`/documents/${item.document.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item.document.code}
                      </Link>
                      <div className={styles.title}>{item.document.title}</div>
                      <div className="secondary-text">
                        {item.document.project?.code ?? '—'}
                        {item.document.section?.name ? ` · ${item.document.section.name}` : ''}
                      </div>
                    </td>
                    <td>
                      <span className={styles.versionPill}>v{item.versionNo}</span>
                    </td>
                    <td>
                      <StatusBadge value={item.approvalStatus} />
                      <div className="secondary-text">{item.approvedBy}</div>
                      <div className="secondary-text">{formatDate(item.approvalDate)}</div>
                    </td>
                    <td>
                      <div className={styles.fileName}>{item.originalFileName}</div>
                      <div className="secondary-text">{formatBytes(item.fileSize)}</div>
                    </td>
                    <td>
                      <StatusBadge value={item.isCurrent ? 'CURRENT' : 'SUPERSEDED'} />
                    </td>
                    <td>
                      <span className={`mono ${styles.path}`} title={item.storagePath}>
                        {item.storagePath}
                      </span>
                    </td>
                    <td>
                      <div>{formatDate(item.createdAt)}</div>
                      {item.createdBy?.name ? (
                        <div className="secondary-text">{item.createdBy.name}</div>
                      ) : null}
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        type="button"
                        className={`button small ${styles.downloadButton}`}
                        disabled={downloadingId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void download(item);
                        }}
                      >
                        <Download size={14} />
                        {downloadingId === item.id ? '…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
