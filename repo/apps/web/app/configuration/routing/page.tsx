'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GitBranch, Link2, MoreVertical, Plus, RefreshCw, Search, ShieldCheck,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import {
  ConfigurationListShell,
  configurationListStyles as configStyles,
} from '@/components/configuration-list-shell';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { useConfirm } from '@/components/confirm-dialog';
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

type RoutingRule = {
  id: string;
  name: string;
  priority: number;
  documentType?: string | null;
  fileExtension?: string | null;
  targetSectionKey: string;
  active?: boolean;
  projectId?: string | null;
  sourceSystemId?: string | null;
  project?: { id: string; code: string; name?: string } | null;
  sourceSystem?: { id: string; name: string } | null;
};

const blankForm = (priority = 100): RuleForm => ({
  name: '',
  projectId: '',
  sourceSystemId: '',
  documentType: '',
  fileExtension: '',
  targetSectionKey: '',
  priority,
  active: true,
});

export default function RoutingRulesPage() {
  const confirm = useConfirm();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState<RuleForm>(blankForm());
  const [editForm, setEditForm] = useState<RuleForm>(blankForm());
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);
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

  const nextPriority = useMemo(() => {
    if (!rules.length) return 100;
    return Math.max(...rules.map((rule) => Number(rule.priority) || 0)) + 10;
  }, [rules]);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, s, types] = await Promise.all([
        api<RoutingRule[]>('/routing-rules'),
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
    setMounted(true);
  }, []);

  useEffect(() => {
    activeMenuAnchor.current = openMenuId ? menuButtonRefs.current[openMenuId] ?? null : null;
  }, [openMenuId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...rules]
      .sort((a, b) => a.priority - b.priority)
      .filter((rule) => {
        if (statusFilter === 'ACTIVE' && rule.active === false) return false;
        if (statusFilter === 'INACTIVE' && rule.active !== false) return false;
        if (!needle) return true;
        const haystack = [
          rule.name,
          rule.documentType,
          rule.fileExtension,
          rule.targetSectionKey,
          rule.project?.code,
          rule.sourceSystem?.name,
          String(rule.priority),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
  }, [rules, query, statusFilter]);

  const openRule = openMenuId
    ? filtered.find((rule) => rule.id === openMenuId) ?? rules.find((rule) => rule.id === openMenuId) ?? null
    : null;

  const stats = useMemo(() => {
    const active = rules.filter((rule) => rule.active !== false).length;
    const global = rules.filter((rule) => !rule.projectId && !rule.project?.id).length;
    return { total: rules.length, active, global, shown: filtered.length };
  }, [rules, filtered.length]);

  const toPayload = (values: RuleForm) => ({
    ...values,
    projectId: values.projectId || null,
    sourceSystemId: values.sourceSystemId || null,
  });

  const openCreate = () => {
    setForm(blankForm(nextPriority));
    setShowCreate(true);
    setError('');
    setMessage('');
  };

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
      setShowCreate(false);
      setForm(blankForm(nextPriority));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save rule');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rule: RoutingRule) => {
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

  const removeRule = async (rule: RoutingRule) => {
    setOpenMenuId(null);
    const ok = await confirm({
      title: 'Delete routing rule',
      message: `Delete routing rule “${rule.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(rule.id);
    setError('');
    setMessage('');
    try {
      await api(`/routing-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' });
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
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
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
              <option key={s.id || s.sectionKey} value={s.sectionKey}>{s.name}</option>
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
        <small>Lowest number wins. Priority must be unique.</small>
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
    <ConfigurationListShell
      title="Routing Rules"
      description="Configuration-based routing replaces hard-coded project logic. Lowest priority number is evaluated first."
      error={!showCreate && !editing ? error : undefined}
      message={!showCreate && !editing ? message : undefined}
      stats={[
        {
          label: 'Rules',
          value: stats.total,
          hint: 'Configured routing paths',
          icon: <GitBranch size={18} />,
          tone: 'blue',
        },
        {
          label: 'Active',
          value: stats.active,
          hint: 'Evaluated during import',
          icon: <ShieldCheck size={18} />,
          tone: 'green',
        },
        {
          label: 'Global',
          value: stats.global,
          hint: 'Apply across all projects',
          icon: <Link2 size={18} />,
          tone: 'orange',
        },
      ]}
      toolbar={(
        <>
          <button type="button" className="button primary small" onClick={openCreate}>
            <Plus size={14} /> Add rule
          </button>
          <select
            className={configStyles.select}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
            title="Filter by status"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <div className={configStyles.searchWrap}>
            <Search size={15} className={configStyles.searchIcon} />
            <input
              className={configStyles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, project, type or section"
              aria-label="Search routing rules"
            />
          </div>
          <button
            type="button"
            className={`button small ${configStyles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh rules"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? configStyles.spinning : undefined} />
            Refresh
          </button>
          <span className={configStyles.count}>{stats.shown} shown</span>
        </>
      )}
      loading={loading}
      empty={filtered.length === 0 ? {
        title: 'No routing rules found',
        text: rules.length === 0
          ? 'Use Add rule to create the first routing path.'
          : 'No rules match the current filters.',
      } : null}
      footer={(
        <>
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
              onClick={() => openRule && void removeRule(openRule)}
            >
              Delete
            </button>
          </RowActionsMenu>

          {mounted && showCreate
            ? createPortal(
                <div
                  className={styles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="routing-create-title"
                  onMouseDown={(event) => {
                    if (!saving && event.target === event.currentTarget) setShowCreate(false);
                  }}
                >
                  <form className={`${styles.editModalCard} ${configStyles.moduleDetailsCard}`} onSubmit={submit}>
                    <h3 id="routing-create-title">Add routing rule</h3>
                    <p>Define conditions and the target repository section for imports.</p>
                    {renderRuleFields(form, setForm, sections, 'create')}
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={styles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving}>
                        {saving ? 'Creating…' : 'Create rule'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body,
              )
            : null}

          {mounted && editing
            ? createPortal(
                <div
                  className={styles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="routing-edit-title"
                  onMouseDown={(event) => {
                    if (!saving && event.target === event.currentTarget) setEditing(null);
                  }}
                >
                  <form className={`${styles.editModalCard} ${configStyles.moduleDetailsCard}`} onSubmit={saveEdit}>
                    <h3 id="routing-edit-title">Edit routing rule</h3>
                    <p>Update conditions and target for “{editing.name}”.</p>
                    {renderRuleFields(editForm, setEditForm, editSections, 'edit')}
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={styles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body,
              )
            : null}
        </>
      )}
    >
      <table>
        <thead>
          <tr>
            <th className={configStyles.colNum}>Priority</th>
            <th className={configStyles.colProject}>Rule</th>
            <th>Conditions</th>
            <th>Target</th>
            <th className={configStyles.colStatus}>Status</th>
            <th className={styles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((rule) => {
            const menuOpen = openMenuId === rule.id;
            const busy = busyId === rule.id;
            return (
              <tr key={rule.id}>
                <td><span className="mono">{rule.priority}</span></td>
                <td className={configStyles.projectCell}>
                  <div className={configStyles.title}>{rule.name}</div>
                  <div className="secondary-text">{rule.project?.code || 'Global'}</div>
                </td>
                <td>
                  <div>{rule.documentType || 'Any type'}</div>
                  <div className="secondary-text">
                    {rule.sourceSystem?.name || 'Any source'}
                    {' · '}
                    {rule.fileExtension ? `.${rule.fileExtension}` : 'Any file'}
                  </div>
                </td>
                <td><span className="mono">{rule.targetSectionKey}</span></td>
                <td><StatusBadge value={rule.active !== false ? 'ACTIVE' : 'INACTIVE'} /></td>
                <td className={`${styles.actionsCell} ${menuOpen ? styles.actionsCellOpen : ''}`}>
                  <div className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[rule.id] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                      aria-label={`Actions for ${rule.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={busy || saving}
                      onClick={() => setOpenMenuId(menuOpen ? null : rule.id)}
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
