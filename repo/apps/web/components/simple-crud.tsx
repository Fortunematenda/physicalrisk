'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ListChecks, MoreVertical, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from './confirm-dialog';
import { ConfigurationListShell, configurationListStyles as configStyles } from './configuration-list-shell';
import { RowActionsMenu } from './row-actions-menu';
import { StatusBadge } from './status-badge';
import styles from './row-actions.module.css';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'json';
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  defaultValue?: unknown;
};

const blankForm = (fields: Field[]) =>
  Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? (field.type === 'checkbox' ? true : '')]));

const normalizePayload = (fields: Field[], form: Record<string, any>) => {
  const payload = { ...form };
  for (const field of fields) {
    if (field.type === 'number') payload[field.key] = Number(payload[field.key]);
    if (field.type === 'json' && typeof payload[field.key] === 'string') {
      payload[field.key] = payload[field.key].trim() ? JSON.parse(payload[field.key]) : [];
    }
  }
  return payload;
};

const formFromItem = (fields: Field[], item: Record<string, any>) => {
  const next: Record<string, any> = {};
  for (const field of fields) {
    const value = item[field.key];
    if (field.type === 'checkbox') next[field.key] = Boolean(value);
    else if (field.type === 'json') next[field.key] = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    else next[field.key] = value ?? '';
  }
  return next;
};

function FieldInputs({
  fields,
  form,
  setForm,
  idPrefix,
}: {
  fields: Field[];
  form: Record<string, any>;
  setForm: (next: Record<string, any>) => void;
  idPrefix: string;
}) {
  return (
    <div className="form-grid">
      {fields.map((field) => (
        <div className={`field ${field.type === 'textarea' || field.type === 'json' ? 'full' : ''}`} key={field.key}>
          {field.type === 'checkbox' ? (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(form[field.key])}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}
              />
              {field.label}
            </label>
          ) : (
            <>
              <label htmlFor={`${idPrefix}-${field.key}`}>
                {field.label}{field.required ? <em> *</em> : null}
              </label>
              {field.type === 'textarea' || field.type === 'json' ? (
                <textarea
                  id={`${idPrefix}-${field.key}`}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={String(form[field.key] ?? '')}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
              ) : field.type === 'select' ? (
                <select
                  id={`${idPrefix}-${field.key}`}
                  required={field.required}
                  value={String(form[field.key] ?? '')}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                >
                  <option value="">Select…</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${idPrefix}-${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={String(form[field.key] ?? '')}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function itemSearchText(item: Record<string, any>, columns: Array<{ key: string }>) {
  return columns
    .map((column) => {
      const value = item[column.key];
      if (value == null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
    .join(' ')
    .toLowerCase();
}

export function SimpleCrud({
  title,
  description,
  endpoint,
  fields,
  columns,
  recordLabel,
}: {
  title: string;
  description: string;
  endpoint: string;
  fields: Field[];
  columns: Array<{ key: string; label: string; render?: (item: any) => React.ReactNode }>;
  recordLabel?: string;
}) {
  const singular = recordLabel ?? title.replace(/s$/, '');
  const hasActive = fields.some((field) => field.key === 'active') || columns.some((column) => column.key === 'active');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState<Record<string, any>>(() => blankForm(fields));
  const [showCreate, setShowCreate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>(() => blankForm(fields));
  const [mounted, setMounted] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);
  const confirm = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api(endpoint));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void load();
  }, [endpoint]);

  useEffect(() => {
    activeMenuAnchor.current = openMenuId ? menuButtonRefs.current[openMenuId] ?? null : null;
  }, [openMenuId]);

  useEffect(() => {
    if (!editing && !showCreate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        setEditing(null);
        setShowCreate(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, showCreate, saving]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (hasActive && statusFilter === 'ACTIVE' && !item.active) return false;
      if (hasActive && statusFilter === 'INACTIVE' && item.active) return false;
      if (!needle) return true;
      return itemSearchText(item, columns).includes(needle);
    });
  }, [items, query, statusFilter, hasActive, columns]);

  const openItem = openMenuId ? filtered.find((item) => item.id === openMenuId) ?? items.find((item) => item.id === openMenuId) : null;

  const stats = useMemo(() => {
    const active = items.filter((item) => item.active !== false).length;
    return {
      total: items.length,
      active,
      shown: filtered.length,
    };
  }, [items, filtered.length]);

  const openCreate = () => {
    setOpenMenuId(null);
    setEditing(null);
    setForm(blankForm(fields));
    setError('');
    setMessage('');
    setShowCreate(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(normalizePayload(fields, form)) });
      setMessage(`${singular} created successfully.`);
      setForm(blankForm(fields));
      setShowCreate(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save record');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: any) => {
    setOpenMenuId(null);
    setShowCreate(false);
    setEditing(item);
    setEditForm(formFromItem(fields, item));
    setError('');
    setMessage('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`${endpoint}/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(normalizePayload(fields, editForm)),
      });
      setMessage(`${singular} updated.`);
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update record');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: any) => {
    setOpenMenuId(null);
    const label = item.name || item.code || item.label || item.key || item.extension || singular;
    const confirmText = item.active === false
      ? `Delete “${label}”? This cannot be undone.`
      : `Remove “${label}”? If it is linked to import history it will be deactivated instead of deleted.`;
    const ok = await confirm({
      title: 'Delete record',
      message: confirmText,
      confirmLabel: item.active === false ? 'Delete' : 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      const result = await api<{ deleted?: boolean; deactivated?: boolean }>(
        `${endpoint}/${encodeURIComponent(item.id)}`,
        { method: 'DELETE' },
      );
      if (result?.deactivated) {
        setMessage(`${singular} deactivated because it is linked to import history.`);
      } else {
        setMessage(`${singular} deleted.`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete record');
    } finally {
      setBusyId(null);
    }
  };

  const modalOpen = showCreate || Boolean(editing);

  return (
    <ConfigurationListShell
      title={title}
      description={description}
      error={!modalOpen ? error : undefined}
      message={!modalOpen ? message : undefined}
      stats={[
        {
          label: title,
          value: stats.total,
          hint: `Configured ${singular.toLowerCase()} records`,
          icon: <ListChecks size={18} />,
          tone: 'blue',
        },
        {
          label: 'Active',
          value: stats.active,
          hint: 'Available for import and routing',
          icon: <ShieldCheck size={18} />,
          tone: 'green',
        },
        {
          label: 'Shown',
          value: stats.shown,
          hint: 'Matching current filters',
          icon: <SlidersHorizontal size={18} />,
          tone: 'orange',
        },
      ]}
      toolbar={(
        <>
          <button type="button" className="button primary small" onClick={openCreate}>
            <Plus size={14} /> Add {singular.toLowerCase()}
          </button>
          {hasActive ? (
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
          ) : null}
          <div className={configStyles.searchWrap}>
            <Search size={15} className={configStyles.searchIcon} />
            <input
              className={configStyles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              aria-label={`Search ${title}`}
            />
          </div>
          <button
            type="button"
            className={`button small ${configStyles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label={`Refresh ${title}`}
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
        title: `No ${title.toLowerCase()} found`,
        text: items.length === 0
          ? `Use Add ${singular.toLowerCase()} to create the first record.`
          : 'No records match the current filters.',
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
              disabled={busyId === openItem?.id}
              onClick={() => openItem && openEdit(openItem)}
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.dangerItem}
              disabled={busyId === openItem?.id}
              onClick={() => openItem && void removeItem(openItem)}
            >
              Delete
            </button>
          </RowActionsMenu>

          {mounted && showCreate
            ? createPortal(
                <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="crud-create-title">
                  <form className={styles.editModalCard} onSubmit={submit}>
                    <h3 id="crud-create-title">Add {singular.toLowerCase()}</h3>
                    <p>Create another configurable record without changing application code.</p>
                    <FieldInputs fields={fields} form={form} setForm={setForm} idPrefix="create" />
                    {error ? <div className="notice error">{error}</div> : null}
                    <div className={styles.editModalActions}>
                      <button type="button" className="button" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button>
                      <button type="submit" className="button primary" disabled={saving}>
                        {saving ? 'Saving…' : 'Create record'}
                      </button>
                    </div>
                  </form>
                </div>,
                document.body,
              )
            : null}

          {mounted && editing
            ? createPortal(
                <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="crud-edit-title">
                  <form className={styles.editModalCard} onSubmit={saveEdit}>
                    <h3 id="crud-edit-title">Edit {singular.toLowerCase()}</h3>
                    <p>Update configuration for {editing.name || editing.code || editing.label || editing.key || singular}.</p>
                    <FieldInputs fields={fields} form={editForm} setForm={setEditForm} idPrefix="edit" />
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
      )}
    >
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            <th className={styles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const menuOpen = openMenuId === item.id;
            const busy = busyId === item.id;
            return (
              <tr key={item.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(item)
                      : column.key === 'active'
                        ? <StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'} />
                        : typeof item[column.key] === 'object'
                          ? <span className="mono">{JSON.stringify(item[column.key])}</span>
                          : String(item[column.key] ?? '—')}
                  </td>
                ))}
                <td className={`${styles.actionsCell} ${menuOpen ? styles.actionsCellOpen : ''}`}>
                  <div className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[item.id] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                      aria-label={`Actions for ${item.name || item.code || item.label || item.key || singular}`}
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
