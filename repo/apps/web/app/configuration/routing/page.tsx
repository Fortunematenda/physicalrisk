'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { api } from '@/lib/api';

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    projectId: '',
    sourceSystemId: '',
    documentType: '',
    fileExtension: '',
    targetSectionKey: '',
    priority: 100,
    active: true,
  });
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === form.projectId),
    [projects, form.projectId],
  );
  const sections = selectedProject?.sections ?? projects[0]?.sections ?? [];

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, s] = await Promise.all([
        api('/routing-rules'),
        api('/projects'),
        api('/source-systems'),
      ]);
      setRules(r);
      setProjects(p);
      setSources(s);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load routing rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/routing-rules', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          projectId: form.projectId || null,
          sourceSystemId: form.sourceSystemId || null,
        }),
      });
      setMessage('Routing rule created.');
      setForm({
        ...form,
        name: '',
        documentType: '',
        fileExtension: '',
        targetSectionKey: '',
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save rule');
    }
  };

  const removeRule = async (id: string, name: string) => {
    if (!window.confirm(`Delete routing rule “${name}”? This cannot be undone.`)) return;
    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      await api(`/routing-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMessage('Routing rule deleted.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete rule');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Routing Rules"
        description="Configuration-based routing replaces hard-coded project logic. Rules can be global or project-specific and are evaluated by priority."
      />
      <div className="grid two">
        <form className="form-card" onSubmit={submit}>
          <div className="form-section">
            <h2>Create routing rule</h2>
            <div className="form-grid">
              <div className="field full">
                <label>Rule name <em>*</em></label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Project scope</label>
                <select
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value, targetSectionKey: '' })}
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Source system</label>
                <select
                  value={form.sourceSystemId}
                  onChange={(e) => setForm({ ...form, sourceSystemId: e.target.value })}
                >
                  <option value="">Any source</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Document type</label>
                <input
                  value={form.documentType}
                  onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                  placeholder="Technical Specifications"
                />
              </div>
              <div className="field">
                <label>File extension</label>
                <input
                  value={form.fileExtension}
                  onChange={(e) => setForm({ ...form, fileExtension: e.target.value })}
                  placeholder="docx"
                />
              </div>
              <div className="field">
                <label>Target section <em>*</em></label>
                <select
                  required
                  value={form.targetSectionKey}
                  onChange={(e) => setForm({ ...form, targetSectionKey: e.target.value })}
                >
                  <option value="">Select…</option>
                  {sections
                    .filter((s: any) => !['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(s.sectionKey))
                    .map((s: any) => (
                      <option key={s.id} value={s.sectionKey}>{s.name}</option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice success">{message}</div>}
          <div className="form-actions">
            <button className="button primary">Create rule</button>
          </div>
        </form>

        <div className="panel">
          <div className="panel-header">
            <h2>Configured rules</h2>
            <span className="secondary-text">Lowest priority number is evaluated first</span>
          </div>
          {loading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Rule</th>
                    <th>Conditions</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.priority}</td>
                      <td>
                        <strong>{r.name}</strong>
                        <div className="secondary-text">{r.project?.code || 'Global'}</div>
                      </td>
                      <td>
                        {r.documentType || 'Any type'}
                        <div className="secondary-text">
                          {r.sourceSystem?.name || 'Any source'} · {r.fileExtension ? `.${r.fileExtension}` : 'Any file'}
                        </div>
                      </td>
                      <td className="mono">{r.targetSectionKey}</td>
                      <td><StatusBadge value={r.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                      <td>
                        <button
                          type="button"
                          className="button small"
                          disabled={deletingId === r.id}
                          onClick={() => void removeRule(r.id, r.name)}
                        >
                          {deletingId === r.id ? 'Deleting…' : 'Delete'}
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
    </>
  );
}
