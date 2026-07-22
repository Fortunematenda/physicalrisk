'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, FileStack, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import styles from '../Configuration.module.css';

type TemplateRow = { id: string; name: string; code: string; isDefault?: boolean };
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
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    directoryTemplateId: '',
    repositoryRootPath: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [projects, templateList] = await Promise.all([
        api<ProjectRow[]>('/projects'),
        api<TemplateRow[]>('/directory-templates'),
      ]);
      setItems(projects);
      setTemplates(templateList);
      setForm((current) => ({
        ...current,
        directoryTemplateId:
          current.directoryTemplateId
          || templateList.find((item) => item.isDefault)?.id
          || templateList[0]?.id
          || '',
      }));
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          repositoryRootPath: form.repositoryRootPath || form.code,
        }),
      });
      setMessage('Project created and its VPS repository folders were provisioned.');
      setForm((current) => ({
        ...current,
        code: '',
        name: '',
        description: '',
        repositoryRootPath: '',
      }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create project');
    } finally {
      setSaving(false);
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

      <div className={styles.layout}>
        <form className={styles.createCard} onSubmit={submit}>
          <div className={styles.createHead}>
            <h2>Create project</h2>
            <p>A new project receives the selected directory template and its folders are provisioned on the VPS volume.</p>
          </div>
          <div className={styles.createBody}>
            <div className="field">
              <label htmlFor="project-code">Project code <em>*</em></label>
              <input
                id="project-code"
                required
                value={form.code}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  code: event.target.value,
                  repositoryRootPath: current.repositoryRootPath || event.target.value.toUpperCase(),
                }))}
                placeholder="PRJ"
              />
            </div>
            <div className="field">
              <label htmlFor="project-name">Project name <em>*</em></label>
              <input
                id="project-name"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="project-root">VPS repository root folder</label>
              <input
                id="project-root"
                className="mono"
                value={form.repositoryRootPath}
                onChange={(event) => setForm((current) => ({ ...current, repositoryRootPath: event.target.value }))}
                placeholder="MOSS"
              />
              <small>Relative to the repository volume. Do not enter an absolute path.</small>
            </div>
            <div className="field">
              <label htmlFor="project-template">Directory template</label>
              <select
                id="project-template"
                value={form.directoryTemplateId}
                onChange={(event) => setForm((current) => ({ ...current, directoryTemplateId: event.target.value }))}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={`field ${styles.full}`}>
              <label htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className={styles.textarea}
              />
            </div>
          </div>
          <div className={styles.createActions}>
            <button type="submit" className="button primary" disabled={saving || templates.length === 0}>
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>

        <div className={styles.panelCard}>
          <div className={styles.toolbar}>
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
                  ? 'Create the first project to provision its VPS repository structure.'
                  : 'No projects match the current filters.'}
              />
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>VPS directory</th>
                    <th>Documents</th>
                    <th>Imports</th>
                    <th>Updated</th>
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
                      <td>
                        <Link
                          href={`/configuration/projects/${item.id}`}
                          className={`primary-text ${styles.docLink}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {item.code}
                        </Link>
                        <div className={styles.title}>{item.name}</div>
                        <div className="secondary-text">{item.description || 'No description'}</div>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
