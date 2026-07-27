'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderTree, LayoutTemplate, MoreVertical, RefreshCw, Search, Star } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { useConfirm } from '@/components/confirm-dialog';
import { api } from '@/lib/api';
import actionStyles from '@/components/row-actions.module.css';
import styles from '../Configuration.module.css';

const DEFAULT_SECTIONS_JSON = `[
  { "name": "01 Governance", "code": "GOV", "sectionKey": "governance", "slug": "01-governance", "position": 1 },
  { "name": "02 Technical", "code": "TEC", "sectionKey": "technical", "slug": "02-technical", "position": 2 }
]`;

type TemplateSection = {
  id?: string;
  name: string;
  code: string;
  sectionKey?: string;
  slug?: string;
  position: number;
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
  sections: string;
};

const blankForm = (): TemplateForm => ({
  code: '',
  name: '',
  description: '',
  isDefault: false,
  sections: DEFAULT_SECTIONS_JSON,
});

export default function TemplatesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState<TemplateForm>(blankForm);
  const [editForm, setEditForm] = useState<TemplateForm>(blankForm);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);
  const openTemplate = openMenuId ? items.find((item) => item.id === openMenuId) : null;
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await api<TemplateRow[]>('/directory-templates'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load templates');
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

  const stats = useMemo(() => {
    const defaults = items.filter((item) => item.isDefault).length;
    const sections = items.reduce((total, item) => total + (item.sections?.length ?? 0), 0);
    return { total: items.length, defaults, sections, shown: filtered.length };
  }, [items, filtered.length]);

  const parseSections = (raw: string) => {
    const sections = JSON.parse(raw);
    if (!Array.isArray(sections)) throw new Error('Sections JSON must be an array');
    return sections;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const sections = parseSections(form.sections);
      await api('/directory-templates', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isDefault: form.isDefault,
          sections,
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
    setOpenMenuId(null);
    setEditing(item);
    setEditForm({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      isDefault: Boolean(item.isDefault),
      sections: JSON.stringify(
        [...(item.sections ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((section) => ({
            name: section.name,
            code: section.code,
            sectionKey: section.sectionKey,
            slug: section.slug,
            position: section.position,
          })),
        null,
        2,
      ),
    });
    setError('');
    setMessage('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const sections = parseSections(editForm.sections);
      await api(`/directory-templates/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code: editForm.code.trim(),
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          isDefault: editForm.isDefault,
          sections,
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
    setOpenMenuId(null);
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/directory-templates/${encodeURIComponent(id)}/set-default`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(`“${name}” is now the system default for new projects and future imports.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The selected directory template could not be updated. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (id: string) => {
    setOpenMenuId(null);
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
    setOpenMenuId(null);
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
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete template');
    } finally {
      setBusyId(null);
    }
  };

  const renderTemplateFields = (
    values: TemplateForm,
    setValues: (next: TemplateForm) => void,
    idPrefix: string,
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
      <div className={`field ${styles.full}`}>
        <label htmlFor={`${idPrefix}-sections`}>Sections JSON <em>*</em></label>
        <textarea
          id={`${idPrefix}-sections`}
          required
          className={styles.textareaTall}
          value={values.sections}
          onChange={(event) => setValues({ ...values, sections: event.target.value })}
        />
        <small>Array of objects with name, code, sectionKey, slug and position.</small>
      </div>
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
        description="Administrators choose which template is the system default. RFP is only a seeded blueprint — it is not hard-coded as the permanent default."
        action={{ label: 'Project Registry', href: '/configuration/projects' }}
      />

      {error && !editing ? <div className="notice error">{error}</div> : null}
      {message && !editing ? <div className="notice success">{message}</div> : null}

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

      <div className={styles.layout}>
        <form className={styles.createCard} onSubmit={submit}>
          <div className={styles.createHead}>
            <h2>Create template</h2>
            <p>Define the ordered repository sections that will be provisioned when a project uses this template.</p>
          </div>
          <div className={styles.createBody}>
            {renderTemplateFields(form, setForm, 'create')}
          </div>
          <div className={styles.createActions}>
            <button type="submit" className="button primary" disabled={saving}>
              {saving && !editing ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>

        <div className={styles.panelCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Search size={15} className={styles.searchIcon} />
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search templates or sections"
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
            <div className={styles.templateList}>
              {filtered.map((item) => {
                const menuOpen = openMenuId === item.id;
                const busy = busyId === item.id;
                return (
                  <article key={item.id} className={styles.templateCard}>
                    <div className={styles.templateTop}>
                      <div>
                        <strong className="primary-text">{item.name}</strong>
                        <div className={`mono ${styles.templateMeta}`}>{item.code}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.isDefault ? <StatusBadge value="DEFAULT" /> : null}
                        <div className={actionStyles.menuWrap}>
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
                      </div>
                    </div>
                    {item.description ? <p className="secondary-text">{item.description}</p> : null}
                    <ol className={styles.sectionTree}>
                      {[...(item.sections ?? [])]
                        .sort((a, b) => a.position - b.position)
                        .map((section) => (
                          <li key={`${item.id}-${section.code}-${section.position}`}>
                            <span className={styles.position}>{section.position}</span>
                            <span className={styles.sectionName}>
                              {section.name}
                              <span className={styles.sectionKey}>{section.sectionKey || section.code}</span>
                            </span>
                            <span className="mono">{section.code}</span>
                          </li>
                        ))}
                    </ol>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RowActionsMenu
        open={Boolean(openTemplate)}
        anchorRef={activeMenuAnchor}
        onClose={() => setOpenMenuId(null)}
      >
        <button
          type="button"
          role="menuitem"
          disabled={busyId === openTemplate?.id}
          onClick={() => openTemplate && openEdit(openTemplate)}
        >
          Edit
        </button>
        {!openTemplate?.isDefault ? (
          <button
            type="button"
            role="menuitem"
            disabled={busyId === openTemplate?.id}
            onClick={() => openTemplate && void setDefault(openTemplate.id, openTemplate.name)}
          >
            Set as default
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          disabled={busyId === openTemplate?.id}
          onClick={() => openTemplate && void duplicate(openTemplate.id)}
        >
          Duplicate
        </button>
        <button
          type="button"
          role="menuitem"
          className={actionStyles.dangerItem}
          disabled={busyId === openTemplate?.id || Boolean(openTemplate?.isDefault)}
          onClick={() => openTemplate && void removeTemplate(openTemplate.id, openTemplate.name, openTemplate.isDefault)}
        >
          Delete
        </button>
      </RowActionsMenu>

      {mounted && editing
        ? createPortal(
            <div className={actionStyles.editModal} role="dialog" aria-modal="true" aria-labelledby="template-edit-title">
              <form className={actionStyles.editModalCard} onSubmit={saveEdit}>
                <h3 id="template-edit-title">Edit directory template</h3>
                <p>Update code, name, description, or sections for {editing.name}.</p>
                <div className={styles.createBody}>
                  {renderTemplateFields(editForm, setEditForm, 'edit')}
                </div>
                {error ? <div className="notice error">{error}</div> : null}
                <div className={actionStyles.editModalActions}>
                  <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
