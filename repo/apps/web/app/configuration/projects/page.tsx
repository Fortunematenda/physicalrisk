'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, FileStack, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { useConfirm } from '@/components/confirm-dialog';
import { CreateProjectModal } from '@/components/import/CreateProjectModal';
import { api, formatDate } from '@/lib/api';
import styles from '../Configuration.module.css';

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  repositoryRootPath: string;
  updatedAt: string;
  sections: Array<{ id: string }>;
  _count: { documents: number; importJobs: number };
};

export default function ProjectsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const projects = await api<ProjectRow[]>('/projects');
      setItems(projects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.code,
        item.name,
        item.description,
        item.repositoryRootPath,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, statusFilter, query]);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === 'ACTIVE').length;
    const documents = items.reduce((total, item) => total + (item._count?.documents ?? 0), 0);
    return { total: items.length, active, documents, shown: filtered.length };
  }, [items, filtered.length]);

  const deleteProject = async (item: ProjectRow) => {
    const ok = await confirm({
      title: 'Delete project',
      message: item._count.documents > 0
        ? `“${item.name}” still has ${item._count.documents} document(s). Remove them first, then delete the project.`
        : `Delete project “${item.name}”? Its VPS folder will be removed. This cannot be undone.`,
      confirmLabel: item._count.documents > 0 ? 'OK' : 'Delete',
      tone: item._count.documents > 0 ? 'default' : 'danger',
    });
    if (!ok || item._count.documents > 0) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/projects/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessage(`Deleted project “${item.name}”.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete project');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Project Registry"
        description="The source of truth for every project, its configurable VPS directory and routing context."
        action={{ label: 'Directory Templates', href: '/configuration/templates' }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconBlue}`}><FolderKanban size={18} /></div>
          <div>
            <span>Projects</span>
            <strong>{stats.total}</strong>
            <small>Registered VPS repositories</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconGreen}`}><ShieldCheck size={18} /></div>
          <div>
            <span>Active</span>
            <strong>{stats.active}</strong>
            <small>Ready for import and routing</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOrange}`}><FileStack size={18} /></div>
          <div>
            <span>Documents</span>
            <strong>{stats.documents}</strong>
            <small>Across all registered projects</small>
          </div>
        </div>
      </div>

      <div className={styles.panelCard}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className="button primary small"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} /> Add project
          </button>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            title="Filter by status"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name or folder"
              aria-label="Search projects"
            />
          </div>
          <button
            type="button"
            className={`button small ${styles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh projects"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>
          <span className={styles.count}>{stats.shown} shown</span>
        </div>

        {loading ? (
          <div className={styles.stateWrap}><Loading /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.stateWrap}>
            <EmptyState
              title="No projects found"
              text={items.length === 0
                ? 'Use Add project to create the first project and provision its VPS repository structure.'
                : 'No projects match the current filters.'}
            />
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th className={styles.colProject}>Project</th>
                  <th className={styles.colStatus}>Status</th>
                  <th className={styles.colPath}>VPS directory</th>
                  <th className={styles.colNum}>Documents</th>
                  <th className={styles.colNum}>Imports</th>
                  <th className={styles.colDate}>Updated</th>
                  <th className={styles.colActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Open project ${item.code}`}
                    onClick={() => router.push(`/configuration/projects/${item.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/configuration/projects/${item.id}`);
                      }
                    }}
                  >
                    <td className={styles.projectCell}>
                      <Link
                        href={`/configuration/projects/${item.id}`}
                        className={`primary-text ${styles.docLink} ${styles.projectCode}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item.code}
                      </Link>
                      <div className={styles.title}>{item.name}</div>
                      <div className={styles.projectDescription}>{item.description || 'No description'}</div>
                    </td>
                    <td><StatusBadge value={item.status} /></td>
                    <td>
                      <span className={`mono ${styles.path}`} title={`repository/${item.repositoryRootPath}`}>
                        repository/{item.repositoryRootPath}
                      </span>
                      <div className="secondary-text">{item.sections.length} sections</div>
                    </td>
                    <td>{item._count.documents}</td>
                    <td>{item._count.importJobs}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td className={styles.colActions}>
                      <div className={styles.iconActions} onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className={styles.iconActionBtn}
                          onClick={() => router.push(`/configuration/projects/${item.id}`)}
                          title="Edit project"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconActionBtn} ${styles.iconActionBtnDanger}`}
                          disabled={busyId === item.id}
                          onClick={() => void deleteProject(item)}
                          title="Delete project"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate ? (
        <CreateProjectModal
          onCancel={() => setShowCreate(false)}
          onCreated={async (created) => {
            setShowCreate(false);
            setMessage(`Project “${created.name}” created and its VPS repository folders were provisioned.`);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
