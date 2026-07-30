'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderTree, LayoutTemplate, MoreVertical, Pencil, Plus, RefreshCw, Search, Star, Trash2,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { useConfirm } from '@/components/confirm-dialog';
import {
  ConfigurationListShell,
  configurationListStyles as styles,
} from '@/components/configuration-list-shell';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { api } from '@/lib/api';
import { deriveSectionFields, syncLinkedSectionFields } from '@/lib/section-fields';
import actionStyles from '@/components/row-actions.module.css';

type TemplateSection = {
  id?: string;
  name: string;
  code: string;
  sectionKey: string;
  slug?: string;
  position: number;
  active?: boolean;
};

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  active?: boolean;
  sections: TemplateSection[];
};

type TemplateForm = {
  code: string;
  name: string;
  description: string;
  isDefault: boolean;
  sections: TemplateSection[];
};

const blankForm = (): TemplateForm => ({
  code: '',
  name: '',
  description: '',
  isDefault: false,
  sections: [],
});

function catalogFromTemplates(templates: TemplateRow[]): TemplateSection[] {
  const map = new Map<string, TemplateSection>();
  for (const template of templates) {
    for (const section of template.sections ?? []) {
      const key = section.sectionKey || section.code;
      if (!key || map.has(key)) continue;
      map.set(key, {
        name: section.name,
        code: section.code,
        sectionKey: section.sectionKey || key,
        slug: section.slug,
        position: section.position,
        active: section.active !== false,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function withPositions(sections: TemplateSection[]): TemplateSection[] {
  return sections.map((section, index) => ({ ...section, position: index + 1 }));
}

export default function TemplatesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<TemplateForm>(blankForm);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editForm, setEditForm] = useState<TemplateForm>(blankForm);
  const [details, setDetails] = useState<TemplateRow | null>(null);
  const [moduleDraft, setModuleDraft] = useState(deriveSectionFields(''));
  const [editingModuleKey, setEditingModuleKey] = useState<string | null>(null);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [moduleTarget, setModuleTarget] = useState<'create' | 'edit'>('create');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await api<TemplateRow[]>('/directory-templates');
      setItems(next);
      setDetails((current) => {
        if (!current) return null;
        return next.find((item) => item.id === current.id) ?? null;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load templates');
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

  const catalog = useMemo(() => catalogFromTemplates(items), [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [
        item.code,
        item.name,
        item.description,
        ...(item.sections ?? []).flatMap((section) => [section.name, section.code, section.sectionKey]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  const openItem = openMenuId
    ? filtered.find((item) => item.id === openMenuId) ?? items.find((item) => item.id === openMenuId) ?? null
    : null;

  const stats = useMemo(() => {
    const defaults = items.filter((item) => item.isDefault).length;
    const sections = items.reduce((total, item) => total + (item.sections?.length ?? 0), 0);
    return { total: items.length, defaults, sections, shown: filtered.length };
  }, [items, filtered.length]);

  const toggleModule = (module: TemplateSection, target: 'create' | 'edit') => {
    const apply = (current: TemplateForm): TemplateForm => {
      const key = module.sectionKey;
      const exists = current.sections.some((section) => section.sectionKey === key);
      const nextSections = exists
        ? current.sections.filter((section) => section.sectionKey !== key)
        : [...current.sections, { ...module, position: current.sections.length + 1 }];
      return { ...current, sections: withPositions(nextSections) };
    };
    if (target === 'edit') setEditForm(apply);
    else setForm(apply);
  };

  const openAddModule = (target: 'create' | 'edit') => {
    setModuleTarget(target);
    setEditingModuleKey(null);
    setModuleDraft(deriveSectionFields(''));
    setShowModuleModal(true);
  };

  const openEditModule = (section: TemplateSection, target: 'create' | 'edit') => {
    setModuleTarget(target);
    setEditingModuleKey(section.sectionKey);
    setModuleDraft({
      name: section.name,
      sectionKey: section.sectionKey,
      code: section.code,
      relativePath: section.name,
      slug: section.slug || '',
    });
    setShowModuleModal(true);
  };

  const applyModuleDraft = () => {
    const derived = deriveSectionFields(moduleDraft.name || moduleDraft.sectionKey || moduleDraft.code);
    const nextSection: TemplateSection = {
      name: derived.name,
      sectionKey: moduleDraft.sectionKey || derived.sectionKey,
      code: moduleDraft.code || derived.code,
      slug: derived.slug,
      position: 1,
      active: true,
    };
    if (!nextSection.name || !nextSection.sectionKey || !nextSection.code) {
      setError('Module name, key and code are required.');
      return;
    }

    const applyToForm = (current: TemplateForm): TemplateForm => {
      const withoutOld = editingModuleKey
        ? current.sections.filter((section) => section.sectionKey !== editingModuleKey)
        : current.sections.filter((section) => section.sectionKey !== nextSection.sectionKey);
      return {
        ...current,
        sections: withPositions([...withoutOld, nextSection]),
      };
    };

    if (moduleTarget === 'edit') setEditForm((current) => applyToForm(current));
    else setForm((current) => applyToForm(current));
    setShowModuleModal(false);
    setError('');
  };

  const removeModuleFromForm = (sectionKey: string, target: 'create' | 'edit') => {
    if (target === 'edit') {
      setEditForm((current) => ({
        ...current,
        sections: withPositions(current.sections.filter((section) => section.sectionKey !== sectionKey)),
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      sections: withPositions(current.sections.filter((section) => section.sectionKey !== sectionKey)),
    }));
  };

  const openCreate = () => {
    setForm(blankForm());
    setShowCreate(true);
    setError('');
    setMessage('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.sections.length) {
      setError('Select at least one module for the template.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api('/directory-templates', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isDefault: form.isDefault,
          sections: withPositions(form.sections),
        }),
      });
      setMessage('Directory template created.');
      setShowCreate(false);
      setForm(blankForm());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create template');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: TemplateRow) => {
    setOpenMenuId(null);
    setDetails(null);
    setEditing(item);
    setEditForm({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      isDefault: Boolean(item.isDefault),
      sections: withPositions([...(item.sections ?? [])].sort((a, b) => a.position - b.position)),
    });
    setError('');
    setMessage('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!editForm.sections.length) {
      setError('Select at least one module for the template.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code: editForm.code.trim(),
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          isDefault: editForm.isDefault,
          sections: withPositions(editForm.sections),
        }),
      });
      setMessage('Directory template updated.');
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update template');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (item: TemplateRow) => {
    setOpenMenuId(null);
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(item.id)}/set-default`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(`“${item.name}” is now the system default for new projects.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to set default template');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (item: TemplateRow) => {
    setOpenMenuId(null);
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(item.id)}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Template duplicated.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to duplicate template');
    } finally {
      setBusyId(null);
    }
  };

  const removeTemplate = async (item: TemplateRow) => {
    setOpenMenuId(null);
    if (item.isDefault) {
      setError('Set another template as default before deleting this one.');
      return;
    }
    const ok = await confirm({
      title: 'Delete template',
      message: `Delete template “${item.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessage('Template deleted.');
      if (editing?.id === item.id) setEditing(null);
      if (details?.id === item.id) setDetails(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete template');
    } finally {
      setBusyId(null);
    }
  };

  const renderModulePicker = (values: TemplateForm, target: 'create' | 'edit') => {
    const selectedKeys = new Set(values.sections.map((section) => section.sectionKey));
    const optionsMap = new Map<string, TemplateSection>();
    for (const module of catalog) optionsMap.set(module.sectionKey, module);
    for (const module of values.sections) optionsMap.set(module.sectionKey, module);
    const options = [...optionsMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div className={`field ${styles.full}`}>
        <label>Modules / sections <em>*</em></label>
        <div className={styles.modulePicker}>
          <div className={styles.modulePickerHead}>
            <span className="secondary-text">{values.sections.length} selected</span>
            <button type="button" className="button small" onClick={() => openAddModule(target)}>
              <Plus size={14} /> Add new
            </button>
          </div>
          <div className={styles.moduleOptions}>
            {options.length === 0 ? (
              <p className="secondary-text">No modules yet. Use Add new to create the first one.</p>
            ) : (
              options.map((module) => {
                const checked = selectedKeys.has(module.sectionKey);
                return (
                  <label key={module.sectionKey} className={styles.moduleOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModule(module, target)}
                    />
                    <span>
                      <strong>{module.name}</strong>
                      <small className="mono">{module.sectionKey} · {module.code}</small>
                    </span>
                    <button
                      type="button"
                      className="button small"
                      title="Edit module"
                      onClick={(event) => {
                        event.preventDefault();
                        openEditModule(module, target);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </label>
                );
              })
            )}
          </div>
          {values.sections.length > 0 ? (
            <ol className={styles.sectionTree}>
              {withPositions([...values.sections]).map((section) => (
                <li key={section.sectionKey}>
                  <span className={styles.position}>{section.position}</span>
                  <span className={styles.sectionName}>
                    {section.name}
                    <span className={styles.sectionKey}>{section.sectionKey} · {section.code}</span>
                  </span>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => openEditModule(section, target)}
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => removeModuleFromForm(section.sectionKey, target)}
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
        <small>Select modules for this template. Order follows selection order.</small>
      </div>
    );
  };

  const renderTemplateFields = (
    values: TemplateForm,
    setValues: (next: TemplateForm) => void,
    idPrefix: string,
    target: 'create' | 'edit',
  ) => (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-code`}>Code <em>*</em></label>
        <input
          id={`${idPrefix}-code`}
          required
          value={values.code}
          onChange={(event) => setValues({ ...values, code: event.target.value })}
          placeholder="STANDARD"
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name <em>*</em></label>
        <input
          id={`${idPrefix}-name`}
          required
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </div>
      <div className={`field ${styles.full}`}>
        <label htmlFor={`${idPrefix}-description`}>Description</label>
        <textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          className={styles.textarea}
        />
      </div>
      {renderModulePicker(values, target)}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={(event) => setValues({ ...values, isDefault: event.target.checked })}
        />
        Set as default template
      </label>
    </>
  );

  return (
    <ConfigurationListShell
      title="Directory Templates"
      description="Reusable directory blueprints that provision repository modules for new projects."
      error={!showModuleModal && !showCreate && !editing ? error : undefined}
      message={!showModuleModal ? message : undefined}
      stats={[
        {
          label: 'Templates',
          value: stats.total,
          hint: 'Reusable directory blueprints',
          icon: <LayoutTemplate size={18} />,
          tone: 'blue',
        },
        {
          label: 'Default',
          value: stats.defaults,
          hint: 'Applied to new projects',
          icon: <Star size={18} />,
          tone: 'green',
        },
        {
          label: 'Modules',
          value: stats.sections,
          hint: 'Across all templates',
          icon: <FolderTree size={18} />,
          tone: 'orange',
        },
      ]}
      toolbar={(
        <>
          <button type="button" className="button primary small" onClick={openCreate}>
            <Plus size={14} /> Add template
          </button>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name or modules"
              aria-label="Search templates"
            />
          </div>
          <button
            type="button"
            className={`button small ${styles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh templates"
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
        title: 'No templates found',
        text: items.length === 0
          ? 'Use Add template to create the first directory blueprint.'
          : 'No templates match the current search.',
      } : null}
      footer={(
        <>
          <RowActionsMenu
            open={Boolean(openItem)}
            anchorRef={activeMenuAnchor}
            onClose={() => setOpenMenuId(null)}
          >
            <button type="button" role="menuitem" disabled={busyId === openItem?.id} onClick={() => openItem && openEdit(openItem)}>
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busyId === openItem?.id || Boolean(openItem?.isDefault)}
              onClick={() => openItem && void setDefault(openItem)}
            >
              Set default
            </button>
            <button type="button" role="menuitem" disabled={busyId === openItem?.id} onClick={() => openItem && void duplicate(openItem)}>
              Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              className={actionStyles.dangerItem}
              disabled={busyId === openItem?.id || Boolean(openItem?.isDefault)}
              onClick={() => openItem && void removeTemplate(openItem)}
            >
              Delete
            </button>
          </RowActionsMenu>

          {mounted && details
            ? createPortal(
                <div
                  className={actionStyles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="template-details-title"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setDetails(null);
                  }}
                >
                  <div className={`${actionStyles.editModalCard} ${styles.moduleDetailsCard}`}>
                    <h3 id="template-details-title">{details.name}</h3>
                    <p>
                      <span className="mono">{details.code}</span>
                      {' · '}
                      {details.sections?.length ?? 0} module{(details.sections?.length ?? 0) === 1 ? '' : 's'}
                      {details.isDefault ? ' · Default' : ''}
                    </p>
                    <div className={styles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Key</th>
                            <th>Name</th>
                            <th>Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...(details.sections ?? [])]
                            .sort((a, b) => a.position - b.position)
                            .map((section) => (
                              <tr key={`${details.id}-${section.sectionKey}`}>
                                <td>{section.position}</td>
                                <td><span className="mono">{section.sectionKey}</span></td>
                                <td>{section.name}</td>
                                <td><span className="mono">{section.code}</span></td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={actionStyles.editModalActions}>
                      <button type="button" className="button" onClick={() => setDetails(null)}>Close</button>
                      <button type="button" className="button primary" onClick={() => openEdit(details)}>Edit template</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {mounted && showCreate
            ? createPortal(
                <div
                  className={actionStyles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="template-create-title"
                  onMouseDown={(event) => {
                    if (!saving && event.target === event.currentTarget) setShowCreate(false);
                  }}
                >
                  <form className={`${actionStyles.editModalCard} ${styles.moduleDetailsCard}`} onSubmit={submit}>
                    <h3 id="template-create-title">Add directory template</h3>
                    <p>Choose modules for this blueprint, then create the template.</p>
                    <div className="form-grid">
                      {renderTemplateFields(form, setForm, 'create', 'create')}
                    </div>
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={actionStyles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving || !form.sections.length}>
                        {saving ? 'Creating…' : 'Create template'}
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
                  className={actionStyles.editModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="template-edit-title"
                  onMouseDown={(event) => {
                    if (!saving && event.target === event.currentTarget) setEditing(null);
                  }}
                >
                  <form className={`${actionStyles.editModalCard} ${styles.moduleDetailsCard}`} onSubmit={saveEdit}>
                    <h3 id="template-edit-title">Edit directory template</h3>
                    <p>Update “{editing.name}” and its selected modules.</p>
                    <div className="form-grid">
                      {renderTemplateFields(editForm, setEditForm, 'edit', 'edit')}
                    </div>
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={actionStyles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving || !editForm.sections.length}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body,
              )
            : null}

          {mounted && showModuleModal
            ? createPortal(
                <div className={actionStyles.editModal} role="dialog" aria-modal="true" aria-labelledby="module-edit-title">
                  <div className={actionStyles.editModalCard}>
                    <h3 id="module-edit-title">{editingModuleKey ? 'Edit module' : 'Add module'}</h3>
                    <p>Linked fields stay in sync — change one and the others update.</p>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="module-name">Name <em>*</em></label>
                        <input
                          id="module-name"
                          value={moduleDraft.name}
                          onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'name', event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="module-key">Key <em>*</em></label>
                        <input
                          id="module-key"
                          className="mono"
                          value={moduleDraft.sectionKey}
                          onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'sectionKey', event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="module-code">Code <em>*</em></label>
                        <input
                          id="module-code"
                          value={moduleDraft.code}
                          onChange={(event) => setModuleDraft((current) => syncLinkedSectionFields(current, 'code', event.target.value))}
                        />
                      </div>
                    </div>
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={actionStyles.editModalActions}>
                      <button type="button" className="button" onClick={() => setShowModuleModal(false)}>Cancel</button>
                      <button type="button" className="button primary" onClick={applyModuleDraft}>
                        {editingModuleKey ? 'Update module' : 'Add module'}
                      </button>
                    </div>
                  </div>
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
            <th className={styles.colCode}>Code</th>
            <th className={styles.colProject}>Template</th>
            <th>Modules</th>
            <th className={styles.colStatus}>Default</th>
            <th className={styles.colStatus}>Status</th>
            <th className={actionStyles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const menuOpen = openMenuId === item.id;
            const busy = busyId === item.id;
            return (
              <tr key={item.id}>
                <td>
                  <span className={`mono ${styles.projectCode}`}>{item.code}</span>
                </td>
                <td className={styles.projectCell}>
                  <div className={styles.title}>{item.name}</div>
                  <div className={styles.projectDescription}>{item.description || 'No description'}</div>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.projectCountBtn}
                    onClick={() => setDetails(item)}
                    title={`View modules in ${item.name}`}
                  >
                    {item.sections?.length ?? 0}
                    <span>module{(item.sections?.length ?? 0) === 1 ? '' : 's'}</span>
                  </button>
                </td>
                <td>{item.isDefault ? <StatusBadge value="DEFAULT" /> : <span className="secondary-text">—</span>}</td>
                <td><StatusBadge value={item.active !== false ? 'ACTIVE' : 'INACTIVE'} /></td>
                <td className={`${actionStyles.actionsCell} ${menuOpen ? actionStyles.actionsCellOpen : ''}`}>
                  <div className={`${actionStyles.menuWrap} ${menuOpen ? actionStyles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[item.id] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${actionStyles.menuButton} ${menuOpen ? actionStyles.menuButtonActive : ''}`}
                      aria-label={`Actions for ${item.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={busy || saving}
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
