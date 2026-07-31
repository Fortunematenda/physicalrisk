'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import styles from '../configuration/Configuration.module.css';

type WorkspaceRow = {
  id: string;
  workspaceCode: string;
  name: string;
  projectCode?: string;
  projectName?: string;
  status: string;
  currentStep: string;
  totalDocuments: number;
  completedDocuments: number;
  progressPercent: number;
  updatedAt: string;
  createdByName?: string;
};

type Project = { id: string; code: string; name: string };

export default function WorkspacesPage() {
  const [items, setItems] = useState<WorkspaceRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('name', query.trim());
      if (status) params.set('status', status);
      if (projectCode) params.set('projectCode', projectCode);
      params.set('mine', 'true');
      const [rows, projectRows] = await Promise.all([
        api<WorkspaceRow[]>(`/workspaces?${params}`),
        api<Project[]>('/projects'),
      ]);
      setItems(rows);
      setProjects(projectRows);
      if (!newProjectId && projectRows[0]) setNewProjectId(projectRows[0].id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, projectCode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.workspaceCode, item.name, item.projectCode, item.projectName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)));
  }, [items, query]);

  const create = async () => {
    if (!newName.trim() || !newProjectId) return;
    setCreating(true);
    setError('');
    try {
      const created = await api<WorkspaceRow>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), projectId: newProjectId }),
      });
      setNewName('');
      window.location.href = `/workspaces/${encodeURIComponent(created.workspaceCode)}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create workspace');
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Repository Workspaces"
        description="Resumable import and review units. Use workspace codes (WS-YYYY-#####) across web, Repo GPT Actions, and MCP."
      />
      {error ? <div className="notice error">{error}</div> : null}

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, name or project"
          />
        </label>
        <select value={projectCode} onChange={(event) => setProjectCode(event.target.value)}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.code}>{project.code}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {['DRAFT', 'METADATA_REVIEW', 'VALIDATION_REQUIRED', 'READY_TO_IMPORT', 'IMPORTING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'PAUSED', 'ARCHIVED'].map((value) => (
            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <button type="button" className="button" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <strong>Create workspace</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input
            className="input"
            style={{ minWidth: 220 }}
            placeholder="Workspace name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <select className="input" value={newProjectId} onChange={(event) => setNewProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
            ))}
          </select>
          <button type="button" className="button primary" disabled={creating || !newName.trim()} onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>

      {loading ? <Loading /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          text="Create a workspace or import a ZIP pack — ZIP imports automatically create a workspace."
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Project</th>
                <th>Status</th>
                <th>Step</th>
                <th>Progress</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td><span className="mono">{item.workspaceCode}</span></td>
                  <td>{item.name}</td>
                  <td>{item.projectCode}</td>
                  <td><StatusBadge value={item.status} /></td>
                  <td>{item.currentStep}</td>
                  <td>{item.completedDocuments}/{item.totalDocuments} ({item.progressPercent}%)</td>
                  <td>{formatDate(item.updatedAt)}</td>
                  <td>
                    <Link className="button small" href={`/workspaces/${encodeURIComponent(item.workspaceCode)}`}>
                      Continue
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
