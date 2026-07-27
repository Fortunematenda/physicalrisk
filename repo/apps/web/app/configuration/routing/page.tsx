'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { api } from '@/lib/api';
import styles from '@/components/row-actions.module.css';

type DocumentTypeOption = {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
};

type RuleForm = {
  name: string;
  projectId: string;
  sourceSystemId: string;
  documentType: string;
  fileExtension: string;
  targetSectionKey: string;
  priority: number;
  active: boolean;
};

const blankForm = (): RuleForm => ({
  name: '',
  projectId: '',
  sourceSystemId: '',
  documentType: '',
  fileExtension: '',
  targetSectionKey: '',
  priority: 100,
  active: true,
});

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<RuleForm>(blankForm);
  const [editForm, setEditForm] = useState<RuleForm>(blankForm);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);
  const openRule = openMenuId ? rules.find((rule) => rule.id === openMenuId) : null;
  const [mounted, setMounted] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === form.projectId),
    [projects, form.projectId],
  );
  const editSelectedProject = useMemo(
    () => projects.find((p) => p.id === editForm.projectId),
    [projects, editForm.projectId],
  );
  const sections = selectedProject?.sections ?? projects[0]?.sections ?? [];
  const editSections = editSelectedProject?.sections ?? projects[0]?.sections ?? [];
  const activeDocumentTypes = useMemo(
    () => documentTypes.filter((item) => item.active !== false),
    [documentTypes],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, s, types] = await Promise.all([
        api('/routing-rules'),
        api('/projects'),
        api('/source-systems'),
        api('/document-types'),
      ]);
      setRules(r);
      setProjects(p);
      setSources(s);
      setDocumentTypes(Array.isArray(types) ? types : []);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load routing rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    activeMenuAnchor.current = openMenuId ? menuButtonRefs.current[openMenuId] ?? null : null;
  }, [openMenuId]);

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setEditing(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, saving]);

  const toPayload = (values: RuleForm) => ({
    ...values,
    projectId: values.projectId || null,
    sourceSystemId: values.sourceSystemId || null,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api('/routing-rules', {
        method: 'POST',
        body: JSON.stringify(toPayload(form)),
      });
      setMessage('Routing rule created.');
      setForm((current) => ({
        ...blankForm(),
        priority: current.priority,
        projectId: current.projectId,
        sourceSystemId: current.sourceSystemId,
      }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save rule');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rule: any) => {
    setOpenMenuId(null);
    setEditing(rule);
    setEditForm({
      name: rule.name ?? '',
      projectId: rule.projectId ?? rule.project?.id ?? '',
      sourceSystemId: rule.sourceSystemId ?? rule.sourceSystem?.id ?? '',
      documentType: rule.documentType ?? '',
      fileExtension: rule.fileExtension ?? '',
      targetSectionKey: rule.targetSectionKey ?? '',
      priority: Number(rule.priority ?? 100),
      active: rule.active !== false,
    });
    setError('');
    setMessage('');
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/routing-rules/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(toPayload(editForm)),
      });
      setMessage('Routing rule updated.');
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update rule');
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id: string, name: string) => {
    setOpenMenuId(null);
    if (!window.confirm(`Delete routing rule “${name}”? This cannot be undone.`)) return;
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/routing-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMessage('Routing rule deleted.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete rule');
    } finally {
      setBusyId(null);
    }
  };

  const renderRuleFields = (
    values: RuleForm,
    setValues: (next: RuleForm) => void,
    sectionOptions: any[],
    idPrefix: string,
  ) => (
    <div className="form-grid">
      <div className="field full">
        <label htmlFor={`${idPrefix}-name`}>Rule name <em>*</em></label>
        <input
          id={`${idPrefix}-name`}
          required
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-project`}>Project scope</label>
        <select
          id={`${idPrefix}-project`}
          value={values.projectId}
          onChange={(e) => setValues({ ...values, projectId: e.target.value, targetSectionKey: '' })}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-source`}>Source system</label>
        <select
          id={`${idPrefix}-source`}
          value={values.sourceSystemId}
          onChange={(e) => setValues({ ...values, sourceSystemId: e.target.value })}
        >
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-doctype`}>Document type</label>
        <select
          id={`${idPrefix}-doctype`}
          value={values.documentType}
          onChange={(e) => setValues({ ...values, documentType: e.target.value })}
        >
          <option value="">Any type</option>
          {activeDocumentTypes.map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-ext`}>File extension</label>
        <input
          id={`${idPrefix}-ext`}
          value={values.fileExtension}
          onChange={(e) => setValues({ ...values, fileExtension: e.target.value })}
          placeholder="docx"
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-section`}>Target section <em>*</em></label>
        <select
          id={`${idPrefix}-section`}
          required
          value={values.targetSectionKey}
          onChange={(e) => setValues({ ...values, targetSectionKey: e.target.value })}
        >
          <option value="">Select…</option>
          {sectionOptions
            .filter((s: any) => !['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(s.sectionKey))
            .map((s: any) => (
              <option key={s.id} value={s.sectionKey}>{s.name}</option>
            ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-priority`}>Priority</label>
        <input
          id={`${idPrefix}-priority`}
          type="number"
          value={values.priority}
          onChange={(e) => setValues({ ...values, priority: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => setValues({ ...values, active: e.target.checked })}
          />
          Active
        </label>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Routing Rules"
        description="Configuration-based routing replaces hard-coded project logic. Priority must be unique — lowest number wins. If two rules somehow share a priority, oldest rule then lowest ID wins (deterministic, never random)."
      />
      <div className="grid two">
        <form className="form-card" onSubmit={submit}>
          <div className="form-section">
            <h2>Create routing rule</h2>
            {renderRuleFields(form, setForm, sections, 'create')}
          </div>
          {error && !editing ? <div className="notice error">{error}</div> : null}
          {message && !editing ? <div className="notice success">{message}</div> : null}
          <div className="form-actions">
            <button className="button primary" disabled={saving}>{saving && !editing ? 'Saving…' : 'Create rule'}</button>
          </div>
        </form>

        <div className="panel">
          <div className="panel-header">
            <h2>Configured rules</h2>
            <span className="secondary-text">Priority must be unique. Lowest number is evaluated first; then oldest rule; then lowest ID.</span>
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
                    <th className={styles.actionsCell} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const menuOpen = openMenuId === r.id;
                    const busy = busyId === r.id;
                    return (
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
                        <td className={styles.actionsCell}>
                          <div className={styles.menuWrap}>
                            <button
                              type="button"
                              ref={(node) => {
                                menuButtonRefs.current[r.id] = node;
                                if (menuOpen) activeMenuAnchor.current = node;
                              }}
                              className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                              aria-label={`Actions for ${r.name}`}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              disabled={busy || saving}
                              onClick={() => setOpenMenuId(menuOpen ? null : r.id)}
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
            </div>
          )}
        </div>
      </div>

      <RowActionsMenu
        open={Boolean(openRule)}
        anchorRef={activeMenuAnchor}
        onClose={() => setOpenMenuId(null)}
      >
        <button
          type="button"
          role="menuitem"
          disabled={busyId === openRule?.id}
          onClick={() => openRule && openEdit(openRule)}
        >
          Edit
        </button>
        <button
          type="button"
          role="menuitem"
          className={styles.dangerItem}
          disabled={busyId === openRule?.id}
          onClick={() => openRule && void removeRule(openRule.id, openRule.name)}
        >
          Delete
        </button>
      </RowActionsMenu>

      {mounted && editing
        ? createPortal(
            <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="routing-edit-title">
              <form className={styles.editModalCard} onSubmit={saveEdit}>
                <h3 id="routing-edit-title">Edit routing rule</h3>
                <p>Update conditions and target for {editing.name}.</p>
                {renderRuleFields(editForm, setEditForm, editSections, 'edit')}
                {error ? <div className="notice error">{error}</div> : null}
                <div className={styles.editModalActions}>
                  <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
