'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { FolderTree, LayoutTemplate, Pencil, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { useConfirm } from '@/components/confirm-dialog';
import { api } from '@/lib/api';
import { deriveSectionFields, syncLinkedSectionFields } from '@/lib/section-fields';
import styles from '../Configuration.module.css';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(blankForm);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [editForm, setEditForm] = useState<TemplateForm>(blankForm);
  const [moduleDraft, setModuleDraft] = useState(deriveSectionFields(''));
  const [editingModuleKey, setEditingModuleKey] = useState<string | null>(null);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [moduleTarget, setModuleTarget] = useState<'create' | 'edit'>('create');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await api<TemplateRow[]>('/directory-templates');
      setItems(next);
      setSelectedId((current) => {
        if (current && next.some((item) => item.id === current)) return current;
        return next[0]?.id ?? null;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

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

    // Keep catalog-like edits reflected on the selected template detail when editing an existing template section.
    if (selected && editingModuleKey) {
      setItems((current) => current.map((item) => {
        if (item.id !== selected.id) return item;
        return {
          ...item,
          sections: withPositions(
            item.sections.map((section) => (
              section.sectionKey === editingModuleKey ? { ...section, ...nextSection } : section
            )),
          ),
        };
      }));
    }

    setShowModuleModal(false);
    setError('');
  };

  const removeModuleFromForm = async (sectionKey: string, target: 'create' | 'edit' | 'selected') => {
    if (target === 'selected' && selected) {
      const ok = await confirm({
        title: 'Remove module',
        message: `Remove this module from “${selected.name}”? Save the template afterwards to persist.`,
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
      const nextSections = withPositions(selected.sections.filter((section) => section.sectionKey !== sectionKey));
      setBusyId(selected.id);
      try {
        await api(`/directory-templates/${encodeURIComponent(selected.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            code: selected.code,
            name: selected.name,
            description: selected.description ?? null,
            isDefault: Boolean(selected.isDefault),
            sections: nextSections,
          }),
        });
        setMessage('Module removed from template.');
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to remove module');
      } finally {
        setBusyId(null);
      }
      return;
    }
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
      setForm(blankForm());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create template');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: TemplateRow) => {
    setSelectedId(item.id);
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

  const setDefault = async (id: string, name: string) => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(id)}/set-default`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(`“${name}” is now the system default for new projects.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to set default template');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (id: string) => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Template duplicated.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to duplicate template');
    } finally {
      setBusyId(null);
    }
  };

  const removeTemplate = async (id: string, name: string, isDefault?: boolean) => {
    if (isDefault) {
      setError('Set another template as default before deleting this one.');
      return;
    }
    const ok = await confirm({
      title: 'Delete template',
      message: `Delete template “${name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setMessage('Template deleted.');
      if (selectedId === id) setSelectedId(null);
      if (editing?.id === id) setEditing(null);
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
                    onClick={() => void removeModuleFromForm(section.sectionKey, target)}
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
    <div className={styles.page}>
      <PageHeader
        title="Directory Templates"
        description="List templates, open one to manage its modules, and assign modules with multi-select instead of JSON."
        action={{ label: 'Project Registry', href: '/configuration/projects' }}
      />

      {error && !showModuleModal ? <div className="notice error">{error}</div> : null}
      {message && !showModuleModal ? <div className="notice success">{message}</div> : null}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconBlue}`}><LayoutTemplate size={18} /></div>
          <div>
            <span>Templates</span>
            <strong>{stats.total}</strong>
            <small>Reusable directory blueprints</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconGreen}`}><Star size={18} /></div>
          <div>
            <span>Default</span>
            <strong>{stats.defaults}</strong>
            <small>Applied to new projects</small>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOrange}`}><FolderTree size={18} /></div>
          <div>
            <span>Sections</span>
            <strong>{stats.sections}</strong>
            <small>Across all templates</small>
          </div>
        </div>
      </div>

      <div className={styles.templatesWorkspace}>
        <form className={styles.createCard} onSubmit={submit}>
          <div className={styles.createHead}>
            <h2>Create template</h2>
            <p>Choose modules from the list, or add a new module, then save the template.</p>
          </div>
          <div className={styles.createBody}>
            {renderTemplateFields(form, setForm, 'create', 'create')}
          </div>
          <div className={styles.createActions}>
            <button type="submit" className="button primary" disabled={saving || !form.sections.length}>
              {saving && !editing ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>

        <div className={styles.splitLayout}>
          <div className={styles.panelCard}>
            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  className={styles.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search templates"
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
            </div>

            {loading ? (
              <div className={styles.stateWrap}><Loading /></div>
            ) : filtered.length === 0 ? (
              <div className={styles.stateWrap}>
                <EmptyState
                  title="No templates found"
                  text={items.length === 0
                    ? 'Create the first directory template for project provisioning.'
                    : 'No templates match the current search.'}
                />
              </div>
            ) : (
              <div className={styles.projectList}>
                {filtered.map((item) => {
                  const busy = busyId === item.id;
                  const active = selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`${styles.projectButton} ${active ? styles.projectButtonActive : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                    >
                      <div className={styles.templateTop}>
                        <div>
                          <strong>{item.name}</strong>
                          <span className={`mono ${styles.templateMeta}`}>{item.code}</span>
                          <span>{item.sections?.length ?? 0} modules{item.isDefault ? ' · Default' : ''}</span>
                        </div>
                        <div className={styles.templateActions} onClick={(event) => event.stopPropagation()}>
                          {item.isDefault ? <StatusBadge value="DEFAULT" /> : null}
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || saving}
                            onClick={() => openEdit(item)}
                            title="Edit template"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || saving || Boolean(item.isDefault)}
                            onClick={() => void removeTemplate(item.id, item.name, item.isDefault)}
                            title="Delete template"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.panelCard}>
            {!selected ? (
              <div className={styles.stateWrap}>
                <EmptyState title="Select a template" text="Click a template on the left to view and manage its modules." />
              </div>
            ) : (
              <>
                <div className={styles.detailHead}>
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="secondary-text">{selected.description || 'No description'} · {selected.code}</p>
                  </div>
                  <div className={styles.templateActions}>
                    {!selected.isDefault ? (
                      <button
                        type="button"
                        className="button small"
                        disabled={busyId === selected.id}
                        onClick={() => void setDefault(selected.id, selected.name)}
                      >
                        Set default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button small"
                      disabled={busyId === selected.id}
                      onClick={() => void duplicate(selected.id)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => openEdit(selected)}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      className="button small"
                      disabled={Boolean(selected.isDefault)}
                      onClick={() => void removeTemplate(selected.id, selected.name, selected.isDefault)}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
                <ol className={styles.sectionTree}>
                  {[...(selected.sections ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map((section) => (
                      <li key={`${selected.id}-${section.sectionKey}-${section.position}`}>
                        <span className={styles.position}>{section.position}</span>
                        <span className={styles.sectionName}>
                          {section.name}
                          <span className={styles.sectionKey}>{section.sectionKey} · {section.code}</span>
                        </span>
                        <button
                          type="button"
                          className="button small"
                          onClick={() => {
                            openEdit(selected);
                            openEditModule(section, 'edit');
                          }}
                          title="Edit module"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="button small"
                          onClick={() => void removeModuleFromForm(section.sectionKey, 'selected')}
                          title="Remove module"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                </ol>
              </>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <div className={styles.editOverlay} role="dialog" aria-modal="true" aria-labelledby="template-edit-title">
          <form className={styles.editCard} onSubmit={saveEdit}>
            <h3 id="template-edit-title">Edit directory template</h3>
            <p>Update “{editing.name}” and its selected modules.</p>
            <div className={styles.createBody}>
              {renderTemplateFields(editForm, setEditForm, 'edit', 'edit')}
            </div>
            {error ? <div className="notice error">{error}</div> : null}
            <div className={styles.editActions}>
              <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="button primary" disabled={saving || !editForm.sections.length}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showModuleModal ? (
        <div className={styles.editOverlay} role="dialog" aria-modal="true" aria-labelledby="module-edit-title">
          <div className={styles.editCard}>
            <h3 id="module-edit-title">{editingModuleKey ? 'Edit module' : 'Add module'}</h3>
            <p>Linked fields stay in sync — change one and the others update.</p>
            <div className={styles.createBody}>
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
            <div className={styles.editActions}>
              <button type="button" className="button" onClick={() => setShowModuleModal(false)}>Cancel</button>
              <button type="button" className="button primary" onClick={applyModuleDraft}>
                {editingModuleKey ? 'Update module' : 'Add module'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
