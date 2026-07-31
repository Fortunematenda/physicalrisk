'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import { useConfirm } from '@/components/confirm-dialog';
import { SuccessNotice } from '@/components/success-notice';
import styles from '../source-connections/SourceConnections.module.css';

const MCP_TOOLS = [
  'list_repository_projects',
  'list_repository_modules',
  'list_document_types',
  'resolve_import_targets',
  'check_document_exists',
  'prepare_approved_document',
  'begin_document_upload',
  'upload_document_chunk',
  'submit_approved_document',
  'get_import_status',
] as const;

const MCP_ALL_PROJECTS = '*';

type ProjectRow = { id: string; code: string; name: string };

type McpIntegration = {
  id: string;
  name: string;
  status: string;
  apiKeyPrefix: string;
  allowedProjectIds: string[];
  allowedTools: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  apiKey?: string;
};

export default function McpIntegrationsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<McpIntegration[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revealedKey, setRevealedKey] = useState<{ name: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpIntegration | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    allowedProjectIds: [MCP_ALL_PROJECTS] as string[],
    allowedTools: [...MCP_TOOLS] as string[],
    status: 'ACTIVE',
  });
  const [editSaving, setEditSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    name: '',
    allowedProjectIds: [MCP_ALL_PROJECTS] as string[],
    allowedTools: [...MCP_TOOLS] as string[],
  });

  const allProjectsSelected = form.allowedProjectIds.includes(MCP_ALL_PROJECTS);
  const editAllProjectsSelected = editForm.allowedProjectIds.includes(MCP_ALL_PROJECTS);

  const extractApiKey = (payload: McpIntegration | Record<string, unknown> | null | undefined) => {
    if (!payload || typeof payload !== 'object') return '';
    const direct = (payload as McpIntegration).apiKey;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const nested = (payload as { data?: { apiKey?: string } }).data?.apiKey;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    return '';
  };

  const showApiKey = (name: string, apiKey: string) => {
    setCopied(false);
    setRevealedKey({ name, apiKey });
    setMessage(`API key for ${name} is ready. Copy it now — it will not be shown again.`);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${label}.`);
      setCopied(true);
    } catch {
      setError(`Could not copy ${label}. Select the text and copy it manually.`);
    }
  };

  const copyApiKey = async () => {
    if (!revealedKey?.apiKey) return;
    await copyText(revealedKey.apiKey, 'API key');
  };

  const load = async () => {
    setLoading(true);
    try {
      const [integrations, projectList] = await Promise.all([
        api<McpIntegration[]>('/mcp/integrations'),
        api<ProjectRow[]>('/projects'),
      ]);
      setItems(integrations);
      setProjects(projectList);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load MCP Integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenuId(null);
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

  const toggleProject = (projectId: string) => {
    setForm((current) => {
      const withoutAll = current.allowedProjectIds.filter((id) => id !== MCP_ALL_PROJECTS);
      const next = withoutAll.includes(projectId)
        ? withoutAll.filter((id) => id !== projectId)
        : [...withoutAll, projectId];
      return { ...current, allowedProjectIds: next };
    });
  };

  const toggleAllProjects = () => {
    setForm((current) => ({
      ...current,
      allowedProjectIds: current.allowedProjectIds.includes(MCP_ALL_PROJECTS)
        ? []
        : [MCP_ALL_PROJECTS],
    }));
  };

  const toggleTool = (tool: string) => {
    setForm((current) => ({
      ...current,
      allowedTools: current.allowedTools.includes(tool)
        ? current.allowedTools.filter((value) => value !== tool)
        : [...current.allowedTools, tool],
    }));
  };

  const createIntegration = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || form.allowedProjectIds.length === 0 || form.allowedTools.length === 0) {
      setError('Name, project scope (All projects or at least one project), and at least one tool are required.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    setRevealedKey(null);
    try {
      const created = await api<McpIntegration>('/mcp/integrations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          allowedProjectIds: form.allowedProjectIds.includes(MCP_ALL_PROJECTS)
            ? [MCP_ALL_PROJECTS]
            : form.allowedProjectIds,
          allowedTools: form.allowedTools,
        }),
      });
      const apiKey = extractApiKey(created);
      if (!apiKey) {
        setError('Integration was created but the API key was not returned. Use Rotate to issue a new key.');
      } else {
        showApiKey(created.name || form.name.trim(), apiKey);
      }
      setForm({ name: '', allowedProjectIds: [MCP_ALL_PROJECTS], allowedTools: [...MCP_TOOLS] });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create MCP integration.');
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Rotate API key',
      message: `Rotate the API key for ${name}? The previous key stops working immediately.`,
      confirmLabel: 'Rotate',
      tone: 'danger',
    });
    if (!ok) return;
    setOpenMenuId(null);
    setBusyId(id);
    setError('');
    setMessage('');
    setRevealedKey(null);
    setCopied(false);
    try {
      const updated = await api<McpIntegration>(`/mcp/integrations/${id}/rotate`, { method: 'POST' });
      const apiKey = extractApiKey(updated);
      if (!apiKey) {
        setError('Rotate succeeded but no API key was returned. Try again.');
      } else {
        showApiKey(updated.name || name, apiKey);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rotate API key.');
    } finally {
      setBusyId(null);
    }
  };

  const disable = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Disable integration',
      message: `Disable MCP integration ${name}?`,
      confirmLabel: 'Disable',
      tone: 'danger',
    });
    if (!ok) return;
    setOpenMenuId(null);
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/mcp/integrations/${id}/disable`, { method: 'POST' });
      setMessage(`Disabled ${name}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disable integration.');
    } finally {
      setBusyId(null);
    }
  };

  const grantAllProjects = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Grant all projects',
      message: `Allow ${name} to access ALL repository projects (including ones created later)?`,
      confirmLabel: 'Grant access',
      tone: 'default',
    });
    if (!ok) return;
    setOpenMenuId(null);
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/mcp/integrations/${id}/projects`, {
        method: 'PATCH',
        body: JSON.stringify({ allowedProjectIds: [MCP_ALL_PROJECTS] }),
      });
      setMessage(`${name} can now access all projects.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update project scope.');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (item: McpIntegration) => {
    setOpenMenuId(null);
    setEditing(item);
    setEditForm({
      name: item.name,
      allowedProjectIds: (item.allowedProjectIds || []).length
        ? [...item.allowedProjectIds]
        : [MCP_ALL_PROJECTS],
      allowedTools: (item.allowedTools || []).length ? [...item.allowedTools] : [...MCP_TOOLS],
      status: item.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    });
  };

  const toggleEditProject = (projectId: string) => {
    setEditForm((current) => {
      const withoutAll = current.allowedProjectIds.filter((id) => id !== MCP_ALL_PROJECTS);
      const next = withoutAll.includes(projectId)
        ? withoutAll.filter((id) => id !== projectId)
        : [...withoutAll, projectId];
      return { ...current, allowedProjectIds: next };
    });
  };

  const toggleEditAllProjects = () => {
    setEditForm((current) => ({
      ...current,
      allowedProjectIds: current.allowedProjectIds.includes(MCP_ALL_PROJECTS)
        ? []
        : [MCP_ALL_PROJECTS],
    }));
  };

  const toggleEditTool = (tool: string) => {
    setEditForm((current) => ({
      ...current,
      allowedTools: current.allowedTools.includes(tool)
        ? current.allowedTools.filter((value) => value !== tool)
        : [...current.allowedTools, tool],
    }));
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!editForm.name.trim() || editForm.allowedProjectIds.length === 0 || editForm.allowedTools.length === 0) {
      setError('Name, project scope, and at least one tool are required.');
      return;
    }
    setEditSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/mcp/integrations/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          allowedProjectIds: editForm.allowedProjectIds.includes(MCP_ALL_PROJECTS)
            ? [MCP_ALL_PROJECTS]
            : editForm.allowedProjectIds,
          allowedTools: editForm.allowedTools,
          status: editForm.status,
        }),
      });
      setMessage(`Updated ${editForm.name.trim()}.`);
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update integration.');
    } finally {
      setEditSaving(false);
    }
  };

  const removeIntegration = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete integration',
      message: `Permanently delete MCP integration ${name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setOpenMenuId(null);
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/mcp/integrations/${id}`, { method: 'DELETE' });
      setMessage(`Deleted ${name}.`);
      if (editing?.id === id) setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete integration.');
    } finally {
      setBusyId(null);
    }
  };

  const projectLabel = (projectId: string) => {
    if (projectId === MCP_ALL_PROJECTS) return 'All projects';
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.code}` : projectId.slice(0, 8);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="MCP Integrations"
        description="Manage integrations that allow approved documents to be imported into the repository."
        action={{ label: 'Back to Source Connections', href: '/settings/source-connections' }}
      />

      {error ? <div className="notice error">{error}</div> : null}
      <SuccessNotice message={message} onDismiss={() => setMessage('')} />

      {revealedKey ? (
        <div className={styles.secretModalBackdrop} role="dialog" aria-modal="true" aria-labelledby="mcp-key-title">
          <div className={styles.secretModal}>
            <h2 id="mcp-key-title">Copy your API key</h2>
            <p>
              Full key for <strong>{revealedKey.name}</strong>. This is shown once only —
              not the short key prefix in the table.
            </p>
            <div className={styles.secretBox}>{revealedKey.apiKey}</div>
            <div className={styles.secretModalActions}>
              <button type="button" className="button primary" onClick={() => void copyApiKey()}>
                {copied ? 'Copied' : 'Copy API key'}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setRevealedKey(null);
                  setCopied(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form className="form-card" onSubmit={createIntegration} style={{ marginBottom: 16 }}>
          <section className="form-section">
            <h2>Create integration</h2>
            <p>
              Prefer <strong>All projects</strong> so one API key works across every repository project.
              The API key is displayed once after creation.
            </p>
            <div className="field">
              <label htmlFor="mcp-name">Name <em>*</em></label>
              <input
                id="mcp-name"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="ChatGPT"
              />
            </div>
            <div className="field">
              <label>Allowed projects <em>*</em></label>
              {projects.length === 0 ? (
                <EmptyState title="No projects" text="Register a project before creating an MCP integration." />
              ) : (
                <div className={styles.checkboxGrid}>
                  <label className="field checkbox">
                    <input
                      type="checkbox"
                      checked={allProjectsSelected}
                      onChange={toggleAllProjects}
                    />
                    <span><strong>All projects</strong> — every active project, including future ones</span>
                  </label>
                  {projects.map((project) => (
                    <label key={project.id} className="field checkbox">
                      <input
                        type="checkbox"
                        checked={!allProjectsSelected && form.allowedProjectIds.includes(project.id)}
                        disabled={allProjectsSelected}
                        onChange={() => toggleProject(project.id)}
                      />
                      <span>{project.code} — {project.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Allowed tools</label>
              <div className={styles.checkboxGrid}>
                {MCP_TOOLS.map((tool) => (
                  <label key={tool} className="field checkbox">
                    <input
                      type="checkbox"
                      checked={form.allowedTools.includes(tool)}
                      onChange={() => toggleTool(tool)}
                    />
                    <span className="mono">{tool}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={saving || projects.length === 0}>
              {saving ? 'Creating…' : 'Create integration'}
            </button>
          </div>
        </form>

      <div className="panel">
        <div className="panel-header">
          <h2>Integrations</h2>
          <button type="button" className="button small" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title="No MCP integrations"
            text="Create an integration to issue an API key for ChatGPT Actions."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Key prefix</th>
                  <th>Projects</th>
                  <th>Tools</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th className={styles.actionsCell} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = busyId === item.id;
                  const disabled = item.status === 'DISABLED';
                  const menuOpen = openMenuId === item.id;
                  return (
                    <tr key={item.id}>
                      <td className="primary-text">{item.name}</td>
                      <td><StatusBadge value={item.status} /></td>
                      <td className="mono">{item.apiKeyPrefix}…</td>
                      <td>
                        {(item.allowedProjectIds || []).includes(MCP_ALL_PROJECTS)
                          ? 'All projects'
                          : (item.allowedProjectIds || []).length
                            ? item.allowedProjectIds.map(projectLabel).join(', ')
                            : '—'}
                      </td>
                      <td>
                        <span className="secondary-text">
                          {(item.allowedTools || []).length} tool{(item.allowedTools || []).length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td>{formatDate(item.lastUsedAt)}</td>
                      <td>{formatDate(item.expiresAt)}</td>
                      <td className={`${styles.actionsCell} ${menuOpen ? styles.actionsCellOpen : ''}`}>
                        <div
                          className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}
                          ref={menuOpen ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                            aria-label={`Actions for ${item.name}`}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            disabled={busy}
                            onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {menuOpen ? (
                            <div className={styles.menu} role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => openEdit(item)}
                              >
                                Edit
                              </button>
                              {!(item.allowedProjectIds || []).includes(MCP_ALL_PROJECTS) ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy || disabled}
                                  onClick={() => void grantAllProjects(item.id, item.name)}
                                >
                                  Grant all projects
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy || disabled}
                                onClick={() => void rotate(item.id, item.name)}
                              >
                                Rotate API key
                              </button>
                              {!disabled ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => void disable(item.id, item.name)}
                                >
                                  Disable
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                className={styles.dangerItem}
                                disabled={busy}
                                onClick={() => void removeIntegration(item.id, item.name)}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing ? (
        <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="mcp-edit-title">
          <form className={styles.editModalCard} onSubmit={saveEdit}>
            <h3 id="mcp-edit-title">Edit integration</h3>
            <p>Update name, project scope, tools, or status for {editing.apiKeyPrefix}…</p>
            <div className="field">
              <label htmlFor="mcp-edit-name">Name <em>*</em></label>
              <input
                id="mcp-edit-name"
                required
                value={editForm.name}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="mcp-edit-status">Status</label>
              <select
                id="mcp-edit-status"
                value={editForm.status}
                onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </div>
            <div className="field">
              <label>Allowed projects <em>*</em></label>
              <div className={styles.checkboxGrid}>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    checked={editAllProjectsSelected}
                    onChange={toggleEditAllProjects}
                  />
                  <span><strong>All projects</strong></span>
                </label>
                {projects.map((project) => (
                  <label key={project.id} className="field checkbox">
                    <input
                      type="checkbox"
                      checked={!editAllProjectsSelected && editForm.allowedProjectIds.includes(project.id)}
                      disabled={editAllProjectsSelected}
                      onChange={() => toggleEditProject(project.id)}
                    />
                    <span>{project.code} — {project.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Allowed tools</label>
              <div className={styles.checkboxGrid}>
                {MCP_TOOLS.map((tool) => (
                  <label key={tool} className="field checkbox">
                    <input
                      type="checkbox"
                      checked={editForm.allowedTools.includes(tool)}
                      onChange={() => toggleEditTool(tool)}
                    />
                    <span className="mono">{tool}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.secretModalActions}>
              <button type="submit" className="button primary" disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                className="button"
                disabled={editSaving}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
