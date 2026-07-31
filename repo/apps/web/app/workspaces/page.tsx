'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban,
  Layers,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Workflow,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import {
  ConfigurationListShell,
  configurationListStyles as styles,
} from '@/components/configuration-list-shell';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { useConfirm } from '@/components/confirm-dialog';
import { api, formatDate } from '@/lib/api';
import { canCreateConfiguration, isAdmin } from '@/lib/permissions';
import actionStyles from '@/components/row-actions.module.css';

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

const STATUS_OPTIONS = [
  'DRAFT',
  'METADATA_REVIEW',
  'VALIDATION_REQUIRED',
  'READY_TO_IMPORT',
  'IMPORTING',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'PAUSED',
  'ARCHIVED',
];

export default function WorkspacesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<WorkspaceRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [editing, setEditing] = useState<WorkspaceRow | null>(null);
  const [editName, setEditName] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setAdmin(isAdmin());
    setCanEdit(canCreateConfiguration() || isAdmin());
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
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

  useEffect(() => {
    activeMenuAnchor.current = openMenuId ? menuButtonRefs.current[openMenuId] ?? null : null;
  }, [openMenuId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.workspaceCode, item.name, item.projectCode, item.projectName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)));
  }, [items, query]);

  const openItem = openMenuId
    ? filtered.find((item) => item.id === openMenuId) ?? items.find((item) => item.id === openMenuId) ?? null
    : null;

  const stats = useMemo(() => {
    const open = items.filter((item) => !['COMPLETED', 'ARCHIVED', 'CANCELLED'].includes(item.status)).length;
    const completed = items.filter((item) => item.status === 'COMPLETED').length;
    return { total: items.length, open, completed, shown: filtered.length };
  }, [items, filtered.length]);

  const openWorkspace = (item: WorkspaceRow) => {
    router.push(`/workspaces/${encodeURIComponent(item.workspaceCode)}`);
  };

  const startEdit = (item: WorkspaceRow) => {
    setOpenMenuId(null);
    setEditing(item);
    setEditName(item.name);
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !editName.trim()) return;
    setSavingEdit(true);
    setError('');
    setMessage('');
    try {
      await api(`/workspaces/${encodeURIComponent(editing.workspaceCode)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      setMessage(`Updated workspace ${editing.workspaceCode}.`);
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update workspace');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteWorkspace = async (item: WorkspaceRow) => {
    setOpenMenuId(null);
    const ok = await confirm({
      title: 'Delete workspace',
      message:
        `Delete workspace ${item.workspaceCode} (“${item.name}”)? `
        + 'Workspace documents and activity will be removed. '
        + 'Documents already in the Master Document Index are kept.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/workspaces/${encodeURIComponent(item.workspaceCode)}`, { method: 'DELETE' });
      setMessage(`Deleted workspace ${item.workspaceCode}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete workspace');
    } finally {
      setBusyId(null);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || !newProjectId) return;
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const created = await api<WorkspaceRow>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), projectId: newProjectId }),
      });
      setShowCreate(false);
      setNewName('');
      setMessage(`Workspace ${created.workspaceCode} created.`);
      window.location.href = `/workspaces/${encodeURIComponent(created.workspaceCode)}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create workspace');
      setCreating(false);
    }
  };

  return (
    <ConfigurationListShell
      title="Repository Workspaces"
      description="Manage staged imports from draft through validation and submission into the repository."
      error={error}
      message={message}
      stats={[
        {
          label: 'Workspaces',
          value: stats.total,
          hint: 'Your resumable import units',
          icon: <Layers size={18} />,
          tone: 'blue',
        },
        {
          label: 'In progress',
          value: stats.open,
          hint: 'Not completed or archived',
          icon: <Workflow size={18} />,
          tone: 'orange',
        },
        {
          label: 'Completed',
          value: stats.completed,
          hint: 'Fully imported workspaces',
          icon: <FolderKanban size={18} />,
          tone: 'green',
        },
      ]}
      toolbar={(
        <>
          <button
            type="button"
            className="button primary small"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} /> Create workspace
          </button>
          <select
            className={styles.select}
            value={projectCode}
            onChange={(event) => setProjectCode(event.target.value)}
            aria-label="Filter by project"
            title="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.code}>{project.code}</option>
            ))}
          </select>
          <select
            className={styles.select}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
            title="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name or project"
              aria-label="Search workspaces"
            />
          </div>
          <button
            type="button"
            className={`button small ${styles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh workspaces"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>
          <span className={styles.count}>{stats.shown} shown</span>
        </>
      )}
      loading={loading}
      empty={filtered.length === 0 ? {
        title: 'No workspaces found',
        text: items.length === 0
          ? 'Create a workspace or import a ZIP pack — ZIP imports automatically create a workspace.'
          : 'No workspaces match the current filters.',
      } : null}
      footer={(
        <>
          <RowActionsMenu
            open={Boolean(openItem)}
            anchorRef={activeMenuAnchor}
            onClose={() => setOpenMenuId(null)}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (!openItem) return;
                setOpenMenuId(null);
                openWorkspace(openItem);
              }}
            >
              Continue
            </button>
            {canEdit ? (
              <button
                type="button"
                role="menuitem"
                disabled={busyId === openItem?.id}
                onClick={() => openItem && startEdit(openItem)}
              >
                Edit
              </button>
            ) : null}
            {admin ? (
              <button
                type="button"
                role="menuitem"
                className={actionStyles.dangerItem}
                disabled={busyId === openItem?.id}
                onClick={() => openItem && void deleteWorkspace(openItem)}
              >
                Delete
              </button>
            ) : null}
          </RowActionsMenu>

          {editing ? (
            <div className={actionStyles.editModal} role="dialog" aria-modal="true" aria-labelledby="workspace-edit-title">
              <form className={actionStyles.editModalCard} onSubmit={saveEdit}>
                <h3 id="workspace-edit-title">Edit workspace</h3>
                <p className="mono">{editing.workspaceCode}</p>
                <div className="field">
                  <label htmlFor="ws-edit-name">Name <em>*</em></label>
                  <input
                    id="ws-edit-name"
                    required
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="Workspace name"
                  />
                </div>
                <div className={actionStyles.editModalActions}>
                  <button type="button" className="button" onClick={() => setEditing(null)} disabled={savingEdit}>
                    Cancel
                  </button>
                  <button type="submit" className="button primary" disabled={savingEdit || !editName.trim()}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {showCreate ? (
            <div className={actionStyles.editModal} role="dialog" aria-modal="true" aria-labelledby="workspace-create-title">
              <form className={actionStyles.editModalCard} onSubmit={create}>
                <h3 id="workspace-create-title">Create workspace</h3>
                <p>Starts a resumable import unit with a WS-YYYY-##### code.</p>
                <div className="field">
                  <label htmlFor="ws-name">Name <em>*</em></label>
                  <input
                    id="ws-name"
                    required
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="e.g. ZimSmart Gokwe Pilot Project"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ws-project">Project <em>*</em></label>
                  <select
                    id="ws-project"
                    required
                    value={newProjectId}
                    onChange={(event) => setNewProjectId(event.target.value)}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} — {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={actionStyles.editModalActions}>
                  <button type="button" className="button" onClick={() => setShowCreate(false)} disabled={creating}>
                    Cancel
                  </button>
                  <button type="submit" className="button primary" disabled={creating || !newName.trim()}>
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </>
      )}
    >
      <table>
        <thead>
          <tr>
            <th className={styles.colCode}>Code</th>
            <th className={styles.colProject}>Name</th>
            <th>Project</th>
            <th className={styles.colStatus}>Status</th>
            <th>Step</th>
            <th className={styles.colNum}>Progress</th>
            <th className={styles.colDate}>Updated</th>
            <th className={actionStyles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const menuOpen = openMenuId === item.id;
            const busy = busyId === item.id;
            return (
              <tr
                key={item.id}
                className="clickable-row"
                tabIndex={0}
                role="link"
                aria-label={`Open workspace ${item.workspaceCode}`}
                onClick={() => openWorkspace(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openWorkspace(item);
                  }
                }}
              >
                <td>
                  <Link
                    href={`/workspaces/${encodeURIComponent(item.workspaceCode)}`}
                    className={`primary-text mono ${styles.docLink}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {item.workspaceCode}
                  </Link>
                </td>
                <td>
                  <div className={styles.title}>{item.name}</div>
                  {item.createdByName ? (
                    <div className="secondary-text">{item.createdByName}</div>
                  ) : null}
                </td>
                <td>{item.projectCode || '—'}</td>
                <td><StatusBadge value={item.status} /></td>
                <td>{item.currentStep.replaceAll('_', ' ')}</td>
                <td>
                  {item.completedDocuments}/{item.totalDocuments}
                  <div className="secondary-text">{item.progressPercent}%</div>
                </td>
                <td>{formatDate(item.updatedAt)}</td>
                <td
                  className={`${actionStyles.actionsCell} ${menuOpen ? actionStyles.actionsCellOpen : ''}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={`${actionStyles.menuWrap} ${menuOpen ? actionStyles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[item.id] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${actionStyles.menuButton} ${menuOpen ? actionStyles.menuButtonActive : ''}`}
                      aria-label={`Actions for ${item.workspaceCode}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={busy}
                      onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ConfigurationListShell>
  );
}
