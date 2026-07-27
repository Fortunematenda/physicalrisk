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

type ChatGptSetup = {
  baseUrl: string;
  openApiUrl: string;
  privacyPolicyUrl: string;
  auth: { preferred: string; alternativeHeader: string };
  tools: string[];
  instructions: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export default function McpIntegrationsPage() {
  const [items, setItems] = useState<McpIntegration[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [setup, setSetup] = useState<ChatGptSetup | null>(null);
  const [openApiText, setOpenApiText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revealedKey, setRevealedKey] = useState<{ name: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    allowedProjectIds: [MCP_ALL_PROJECTS] as string[],
    allowedTools: [...MCP_TOOLS] as string[],
  });

  const allProjectsSelected = form.allowedProjectIds.includes(MCP_ALL_PROJECTS);

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
      const [integrations, projectList, setupPayload, openApi] = await Promise.all([
        api<McpIntegration[]>('/mcp/integrations'),
        api<ProjectRow[]>('/projects'),
        fetch(`${API_BASE}/mcp/openai/setup`).then(async (response) => {
          if (!response.ok) throw new Error('Unable to load ChatGPT setup helpers.');
          return response.json() as Promise<ChatGptSetup>;
        }),
        fetch(`${API_BASE}/mcp/openai/openapi.json`).then(async (response) => {
          if (!response.ok) throw new Error('Unable to load OpenAPI schema.');
          return JSON.stringify(await response.json(), null, 2);
        }),
      ]);
      setItems(integrations);
      setProjects(projectList);
      setSetup(setupPayload);
      setOpenApiText(openApi);
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

  const grantAllProjects = async (id: string, name: string) => {
    if (!confirm(`Allow ${name} to access ALL repository projects (including ones created later)?`)) return;
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

  const projectLabel = (projectId: string) => {
    if (projectId === MCP_ALL_PROJECTS) return 'All projects';
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.code}` : projectId.slice(0, 8);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="MCP Integrations"
        description="Issue API keys and wire ChatGPT Custom GPT Actions to the Repository Import Queue."
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

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>ChatGPT Custom GPT setup</h2>
        </div>
        {loading && !setup ? (
          <Loading />
        ) : setup ? (
          <>
            <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Create an integration below with <strong>all tools</strong> and <strong>All projects</strong> so ChatGPT can see every repository project with one API key.</li>
              <li>Copy the <code className="mono">mcp_…</code> API key when it appears.</li>
              <li>
                In ChatGPT → Create a GPT → Actions → Import from URL:{' '}
                <span className="mono">{setup.openApiUrl}</span>
              </li>
              <li>
                Authentication: <strong>API Key</strong> → Auth Type <strong>Bearer</strong> → paste the full key.
                Alternative header: <span className="mono">{setup.auth.alternativeHeader}</span>
              </li>
              <li>
                Privacy policy URL: <span className="mono">{setup.privacyPolicyUrl}</span>
              </li>
              <li>Paste the Instructions below into the GPT Instructions field, then Update and start a <strong>new</strong> chat.</li>
              <li>When ChatGPT asks to allow an action, choose Allow / Always allow.</li>
            </ol>
            <div className={styles.inlineActions} style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button small primary"
                onClick={() => void copyText(setup.openApiUrl, 'OpenAPI URL')}
              >
                Copy OpenAPI URL
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => void copyText(setup.privacyPolicyUrl, 'privacy URL')}
              >
                Copy privacy URL
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => void copyText(setup.instructions, 'GPT instructions')}
              >
                Copy instructions
              </button>
              <button
                type="button"
                className="button small"
                disabled={!openApiText}
                onClick={() => void copyText(openApiText, 'OpenAPI JSON')}
              >
                Copy OpenAPI JSON
              </button>
              <a className="button small" href={setup.openApiUrl} target="_blank" rel="noreferrer">
                Open schema
              </a>
              <a className="button small" href={setup.privacyPolicyUrl} target="_blank" rel="noreferrer">
                Privacy page
              </a>
            </div>
            <div className="field">
              <label htmlFor="gpt-instructions">GPT Instructions</label>
              <textarea
                id="gpt-instructions"
                readOnly
                rows={12}
                value={setup.instructions}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
              />
            </div>
          </>
        ) : (
          <p className="secondary-text">ChatGPT setup helpers unavailable.</p>
        )}
      </div>

      <div className="notice info">
        MCP HTTP endpoint: <span className="mono">/api/mcp</span>
        {' '}(externally also available as <span className="mono">/mcp</span> via nginx).
        {' '}Use Custom GPT Actions with the OpenAPI schema above — not the raw JSON-RPC endpoint alone.
      </div>

      <div className="grid two">
        <form className="form-card" onSubmit={createIntegration}>
          <section className="form-section">
            <h2>Create integration</h2>
            <p>
              Prefer <strong>All projects</strong> so one API key lists and imports across every repository project
              (including new ones). Or pick specific projects to restrict the key.
              The API key is displayed once after creation.
            </p>
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

        <div className="detail-card">
          <h2>Endpoint usage</h2>
          <dl className="detail-list">
            <dt>ChatGPT OpenAPI</dt>
            <dd className="mono">GET /mcp/openai/openapi.json</dd>
            <dt>JSON-RPC</dt>
            <dd className="mono">POST /api/mcp</dd>
            <dt>Tool call (Actions)</dt>
            <dd className="mono">POST /mcp/tools/:toolName</dd>
            <dt>Auth</dt>
            <dd>Bearer mcp_… key, or X-MCP-API-Key</dd>
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
                      <td>
                        <div className={styles.inlineActions}>
                          {!(item.allowedProjectIds || []).includes(MCP_ALL_PROJECTS) ? (
                            <button
                              type="button"
                              className="button small"
                              disabled={busy || disabled}
                              onClick={() => void grantAllProjects(item.id, item.name)}
                            >
                              {busy ? '…' : 'Grant all projects'}
                            </button>
                          ) : null}
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
