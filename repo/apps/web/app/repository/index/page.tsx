'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Link2, MoreVertical, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import styles from './MasterDocumentIndex.module.css';

function MasterDocumentIndexPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState((searchParams.get('search') ?? searchParams.get('q') ?? '').trim());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (nextSearch = search) => {
    setLoading(true);
    const query = new URLSearchParams();
    if (projectId) query.set('projectId', projectId);
    if (nextSearch) query.set('search', nextSearch);
    try {
      setItems(await api(`/documents?${query}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api('/projects').then(setProjects);
  }, []);

  useEffect(() => {
    const fromUrl = (searchParams.get('search') ?? searchParams.get('q') ?? '').trim();
    setSearch(fromUrl);
    void load(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when project or URL search changes
  }, [projectId, searchParams]);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  const stats = useMemo(() => {
    const current = items.filter((item) => item.status === 'CURRENT').length;
    const relations = items.reduce(
      (total, item) => total + (item._count?.outgoingRelationships ?? 0) + (item._count?.incomingRelationships ?? 0),
      0,
    );
    return {
      total: items.length,
      current,
      other: items.length - current,
      relations,
    };
  }, [items]);

  const openDocument = (id: string) => {
    router.push(`/documents/${id}`);
  };

  const editDocument = (id: string) => {
    setOpenMenuId(null);
    router.push(`/documents/${id}?edit=1`);
  };

  const deleteDocument = async (item: { id: string; code: string; title: string }) => {
    setOpenMenuId(null);
    const confirmed = window.confirm(
      `Delete document ${item.code} — ${item.title}?\n\nThis permanently removes the document, all versions, relationships, and VPS files.`,
    );
    if (!confirmed) return;
    setError('');
    setNotice('');
    setDeletingId(item.id);
    try {
      await api(`/documents/${item.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((row) => row.id !== item.id));
      setNotice(`Deleted ${item.code}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Master Document Index"
        description="The central register of approved repository documents, current versions, projects, sections and relationship counts."
        action={{ label: 'Import document', href: '/imports/new' }}
      />
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTotal}`}><FileText size={18} /></div>
          <div>
            <span>Indexed documents</span>
            <strong>{stats.total}</strong>
            <small>Approved repository records</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconCurrent}`}><ShieldCheck size={18} /></div>
          <div>
            <span>Current</span>
            <strong>{stats.current}</strong>
            <small>{stats.other} superseded or archived</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconRelations}`}><Link2 size={18} /></div>
          <div>
            <span>Relationships</span>
            <strong>{stats.relations}</strong>
            <small>Incoming and outgoing links</small>
          </div>
        </div>
      </div>

      <div className={`panel ${openMenuId ? styles.panelOpen : ''}`}>
        <div className="filter-bar">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Filter by project"
            title="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, title or type"
            aria-label="Search documents by code, title or type"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
          />
          <button className="button small" onClick={() => void load()}>Search</button>
          <span className="secondary-text">{items.length} documents</span>
        </div>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="No indexed documents" text="Import the first approved document into the repository." />
        ) : (
          <div className={`table-wrap ${openMenuId ? styles.tableWrapOpen : ''}`}>
            <table>
              <thead>
                <tr>
                  <th>Document ID</th>
                  <th>Title / Type</th>
                  <th>Project</th>
                  <th>Repository section</th>
                  <th>Current version</th>
                  <th>Status</th>
                  <th>Relations</th>
                  <th>Updated</th>
                  <th className={styles.actionsHeading}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Open document ${item.code}`}
                    onClick={() => openDocument(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDocument(item.id);
                      }
                    }}
                  >
                    <td><span className="primary-text mono">{item.code}</span></td>
                    <td>
                      <span className="primary-text">{item.title}</span>
                      <div className="secondary-text">{item.documentType}</div>
                    </td>
                    <td>{item.project.code}</td>
                    <td>{item.section.name}</td>
                    <td>
                      <strong>{item.currentVersionNo}</strong>
                      <div className="secondary-text">{item._count.versions} total</div>
                    </td>
                    <td><StatusBadge value={item.status} /></td>
                    <td>{item._count.outgoingRelationships + item._count.incomingRelationships}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td className={`${styles.actionsCell} ${openMenuId === item.id ? styles.actionsCellOpen : ''}`}>
                      <div
                        className={`${styles.menuWrap} ${openMenuId === item.id ? styles.menuWrapOpen : ''}`}
                        ref={openMenuId === item.id ? menuRef : undefined}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {openMenuId === item.id ? (
                          <button
                            type="button"
                            className={`${styles.menuButton} ${styles.menuButtonActive}`}
                            aria-label={`Actions for ${item.code}`}
                            aria-haspopup="menu"
                            aria-expanded="true"
                            disabled={deletingId === item.id}
                            onClick={() => setOpenMenuId(null)}
                          >
                            <MoreVertical size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.menuButton}
                            aria-label={`Actions for ${item.code}`}
                            aria-haspopup="menu"
                            aria-expanded="false"
                            disabled={deletingId === item.id}
                            onClick={() => setOpenMenuId(item.id)}
                          >
                            <MoreVertical size={16} />
                          </button>
                        )}
                        {openMenuId === item.id ? (
                          <div className={styles.menu} role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => editDocument(item.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.dangerItem}
                              disabled={deletingId === item.id}
                              onClick={() => void deleteDocument(item)}
                            >
                              {deletingId === item.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        ) : null}
                      </div>
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

export default function MasterDocumentIndexPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MasterDocumentIndexPageInner />
    </Suspense>
  );
}
