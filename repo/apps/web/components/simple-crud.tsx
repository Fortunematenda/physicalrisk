'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from './empty-state';
import { Loading } from './loading';
import { PageHeader } from './page-header';
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
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, any>>(() => blankForm(fields));
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>(() => blankForm(fields));
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    void load();
  }, [endpoint]);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
        if (!saving) setEditing(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId, saving]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(normalizePayload(fields, form)) });
      setMessage(`${singular} created successfully.`);
      setForm(blankForm(fields));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save record');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: any) => {
    setOpenMenuId(null);
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
    const label = item.name || item.code || singular;
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`${endpoint}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessage(`${singular} deleted.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete record');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="grid two">
        <form className="form-card" onSubmit={submit}>
          <div className="form-section">
            <h2>Add new</h2>
            <p>Create another configurable record without changing application code.</p>
            <FieldInputs fields={fields} form={form} setForm={setForm} idPrefix="create" />
          </div>
          {error && !editing ? <div className="notice error">{error}</div> : null}
          {message && !editing ? <div className="notice success">{message}</div> : null}
          <div className="form-actions">
            <button className="button primary" disabled={saving}>{saving && !editing ? 'Saving…' : 'Create record'}</button>
          </div>
        </form>
        <div className="panel">
          <div className="panel-header">
            <h2>Configured records</h2>
            <button className="button small" onClick={() => void load()}>Refresh</button>
          </div>
          {loading ? (
            <Loading />
          ) : items.length === 0 ? (
            <EmptyState title="No records" text="Create the first configuration record." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                    <th className={styles.actionsCell} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
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
                          <div
                            className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}
                            ref={menuOpen ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
                              aria-label={`Actions for ${item.name || item.code || singular}`}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              disabled={busy || saving}
                              onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {menuOpen ? (
                              <div className={styles.menu} role="menu">
                                <button type="button" role="menuitem" disabled={busy} onClick={() => openEdit(item)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.dangerItem}
                                  disabled={busy}
                                  onClick={() => void removeItem(item)}
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
      </div>

      {editing ? (
        <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="crud-edit-title">
          <form className={styles.editModalCard} onSubmit={saveEdit}>
            <h3 id="crud-edit-title">Edit {singular.toLowerCase()}</h3>
            <p>Update configuration for {editing.name || editing.code || singular}.</p>
            <FieldInputs fields={fields} form={editForm} setForm={setEditForm} idPrefix="edit" />
            {error ? <div className="notice error">{error}</div> : null}
            <div className={styles.editModalActions}>
              <button type="button" className="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
