'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import styles from '../source-connections/SourceConnections.module.css';

const MCP_TOOLS = [
  'list_repository_projects',
  'list_repository_modules',
  'list_document_types',
  'check_document_exists',
  'submit_approved_document',
  'get_import_status',
] as const;

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
  const [items, setItems] = useState<McpIntegration[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revealedKey, setRevealedKey] = useState<{ name: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    allowedProjectIds: [] as string[],
    allowedTools: [...MCP_TOOLS] as string[],
  });

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

  const copyApiKey = async () => {
    if (!revealedKey?.apiKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.apiKey);
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Select the key and copy it manually.');
    }
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

  const toggleProject = (projectId: string) => {
    setForm((current) => ({
      ...current,
      allowedProjectIds: current.allowedProjectIds.includes(projectId)
        ? current.allowedProjectIds.filter((id) => id !== projectId)
        : [...current.allowedProjectIds, projectId],
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
      setError('Name, at least one project, and at least one tool are required.');
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
          allowedProjectIds: form.allowedProjectIds,
          allowedTools: form.allowedTools,
        }),
      });
      const apiKey = extractApiKey(created);
      if (!apiKey) {
        setError('Integration was created but the API key was not returned. Use Rotate to issue a new key.');
      } else {
        showApiKey(created.name || form.name.trim(), apiKey);
      }
      setForm({ name: '', allowedProjectIds: [], allowedTools: [...MCP_TOOLS] });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create MCP integration.');
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (id: string, name: string) => {
    if (!confirm(`Rotate the API key for ${name}? The previous key stops working immediately.`)) return;
    setBusyId(id);
    setError('');
    setMessage('');
    setRevealedKey(null);
    setCopied(false);
    try {
      const updated = await api<McpIntegration>(`/mcp/integrations/${id}/rotate`, { method: 'POST' });
      const apiKey = extractApiKey(updated);
      if (!apiKey) {
        setError('Rotate succeeded but no API key was returned. Check the Network tab for /rotate, then try again.');
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
    if (!confirm(`Disable MCP integration ${name}?`)) return;
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

  const projectLabel = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.code}` : projectId.slice(0, 8);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="MCP Integrations"
        description="Issue API keys for ChatGPT and other MCP clients to submit Approved Documents."
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

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

      <div className="notice info">
        MCP HTTP endpoint: <span className="mono">/api/mcp</span>
        {' '}(externally also available as <span className="mono">/mcp</span> via nginx).
      </div>

      <div className="grid two">
        <form className="form-card" onSubmit={createIntegration}>
          <section className="form-section">
            <h2>Create integration</h2>
            <p>Choose allowed projects and tools. The API key is displayed once after creation.</p>
            <div className="field">
              <label htmlFor="mcp-name">Name <em>*</em></label>
              <input
                id="mcp-name"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="ChatGPT Production"
              />
            </div>
            <div className="field">
              <label>Allowed projects <em>*</em></label>
              {projects.length === 0 ? (
                <EmptyState title="No projects" text="Register a project before creating an MCP integration." />
              ) : (
                <div className={styles.checkboxGrid}>
                  {projects.map((project) => (
                    <label key={project.id} className="field checkbox">
                      <input
                        type="checkbox"
                        checked={form.allowedProjectIds.includes(project.id)}
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

        <div className="detail-card">
          <h2>Endpoint usage</h2>
          <dl className="detail-list">
            <dt>JSON-RPC</dt>
            <dd className="mono">POST /api/mcp</dd>
            <dt>Tool list</dt>
            <dd className="mono">GET /api/mcp/tools</dd>
            <dt>Auth</dt>
            <dd>Bearer API key from an active integration</dd>
            <dt>Approved Document</dt>
            <dd>submit_approved_document</dd>
          </dl>
        </div>
      </div>

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
            text="Create an integration to issue an API key for ChatGPT MCP clients."
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = busyId === item.id;
                  const disabled = item.status === 'DISABLED';
                  return (
                    <tr key={item.id}>
                      <td className="primary-text">{item.name}</td>
                      <td><StatusBadge value={item.status} /></td>
                      <td className="mono">{item.apiKeyPrefix}…</td>
                      <td>
                        {(item.allowedProjectIds || []).length
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
                      <td>
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || disabled}
                            onClick={() => void rotate(item.id, item.name)}
                          >
                            {busy ? '…' : 'Rotate'}
                          </button>
                          <button
                            type="button"
                            className="button small danger"
                            disabled={busy || disabled}
                            onClick={() => void disable(item.id, item.name)}
                          >
                            Disable
                          </button>
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
    </div>
  );
}
