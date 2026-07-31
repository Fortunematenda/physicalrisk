'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileType2, MoreVertical, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm-dialog';
import {
  ConfigurationListShell,
  configurationListStyles as configStyles,
} from '@/components/configuration-list-shell';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { StatusBadge } from '@/components/status-badge';
import {
  CreateDocumentTypeModal,
  DocumentTypeRecord,
} from '@/components/import/CreateDocumentTypeModal';
import styles from '@/components/row-actions.module.css';

type EditForm = {
  name: string;
  code: string;
  description: string;
  active: boolean;
};

export default function DocumentTypesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<DocumentTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DocumentTypeRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    code: '',
    description: '',
    active: true,
  });
  const [mounted, setMounted] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeMenuAnchor = useRef<HTMLButtonElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const next = await api<DocumentTypeRecord[]>('/document-types');
      setItems(Array.isArray(next) ? next : []);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load document types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    void load();
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
    return items.filter((item) => {
      if (statusFilter === 'ACTIVE' && !item.active) return false;
      if (statusFilter === 'INACTIVE' && item.active) return false;
      if (!needle) return true;
      const haystack = [item.name, item.code, item.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query, statusFilter]);

  const openItem = openMenuId
    ? filtered.find((item) => item.id === openMenuId) ?? items.find((item) => item.id === openMenuId) ?? null
    : null;

  const stats = useMemo(() => {
    const active = items.filter((item) => item.active !== false).length;
    return { total: items.length, active, shown: filtered.length };
  }, [items, filtered.length]);

  const openEdit = (item: DocumentTypeRecord) => {
    setOpenMenuId(null);
    setShowCreate(false);
    setEditing(item);
    setEditForm({
      name: item.name ?? '',
      code: item.code ?? '',
      description: item.description ?? '',
      active: item.active !== false,
    });
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
      await api(`/document-types/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          code: editForm.code.trim(),
          description: editForm.description.trim() || null,
          active: editForm.active,
        }),
      });
      setMessage('Document type updated.');
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update document type');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: DocumentTypeRecord) => {
    setOpenMenuId(null);
    const ok = await confirm({
      title: 'Delete document type',
      message: `Delete “${item.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      await api(`/document-types/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessage('Document type deleted.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete document type');
    } finally {
      setBusyId(null);
    }
  };

  const modalOpen = showCreate || Boolean(editing);

  return (
    <ConfigurationListShell
      title="Document Types"
      description="Classify documents by type and support automatic placement into the correct repository module."
      error={!modalOpen ? error : undefined}
      message={!modalOpen ? message : undefined}
      stats={[
        {
          label: 'Document types',
          value: stats.total,
          hint: 'Configured classifications',
          icon: <FileType2 size={18} />,
          tone: 'blue',
        },
        {
          label: 'Active',
          value: stats.active,
          hint: 'Available during import',
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
          <button type="button" className="button primary small" onClick={() => { setEditing(null); setShowCreate(true); }}>
            <Plus size={14} /> Add document type
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
              placeholder="Search name or code"
              aria-label="Search document types"
            />
          </div>
          <button
            type="button"
            className={`button small ${configStyles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh document types"
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
        title: 'No document types found',
        text: items.length === 0
          ? 'Use Add document type to create the first classification.'
          : 'No document types match the current filters.',
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
              className={styles.dangerItem}
              disabled={busyId === openItem?.id}
              onClick={() => openItem && void removeItem(openItem)}
            >
              Delete
            </button>
          </RowActionsMenu>

          {showCreate ? (
            <CreateDocumentTypeModal
              origin="ADMIN"
              onCancel={() => setShowCreate(false)}
              onCreated={(_item, meta) => {
                setShowCreate(false);
                if (meta?.warning) {
                  setError(meta.warning);
                  setMessage('Document type created.');
                } else {
                  setMessage(
                    meta?.routingRuleCreated
                      ? 'Document type and routing rule created.'
                      : 'Document type created.',
                  );
                  setError('');
                }
                void load();
              }}
            />
          ) : null}

          {mounted && editing
            ? createPortal(
                <div className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="doc-type-edit-title">
                  <form className={styles.editModalCard} onSubmit={saveEdit}>
                    <h3 id="doc-type-edit-title">Edit document type</h3>
                    <p>Update configuration for {editing.name}.</p>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="edit-doc-type-name">Name <em>*</em></label>
                        <input
                          id="edit-doc-type-name"
                          required
                          value={editForm.name}
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="edit-doc-type-code">Code</label>
                        <input
                          id="edit-doc-type-code"
                          value={editForm.code}
                          onChange={(event) => setEditForm({ ...editForm, code: event.target.value })}
                        />
                      </div>
                      <div className="field full">
                        <label htmlFor="edit-doc-type-description">Description</label>
                        <textarea
                          id="edit-doc-type-description"
                          value={editForm.description}
                          onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={editForm.active}
                            onChange={(event) => setEditForm({ ...editForm, active: event.target.checked })}
                          />
                          Active
                        </label>
                      </div>
                    </div>
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
            <th>Name</th>
            <th>Code</th>
            <th>Description</th>
            <th>Status</th>
            <th className={styles.actionsCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const menuOpen = openMenuId === item.id;
            const busy = busyId === item.id;
            return (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td><span className="mono">{item.code}</span></td>
                <td>{item.description || '—'}</td>
                <td><StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                <td className={`${styles.actionsCell} ${menuOpen ? styles.actionsCellOpen : ''}`}>
                  <div className={`${styles.menuWrap} ${menuOpen ? styles.menuWrapOpen : ''}`}>
                    <button
                      type="button"
                      ref={(node) => {
                        menuButtonRefs.current[item.id] = node;
                        if (menuOpen) activeMenuAnchor.current = node;
                      }}
                      className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ''}`}
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
