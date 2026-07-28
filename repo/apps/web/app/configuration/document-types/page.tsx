'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { PageHeader } from '@/components/page-header';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { StatusBadge } from '@/components/status-badge';
import {
  DocumentTypeCreatePanel,
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
  const openItem = openMenuId ? items.find((item) => item.id === openMenuId) : null;

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

  const openEdit = (item: DocumentTypeRecord) => {
    setOpenMenuId(null);
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

  return (
    <>
      <PageHeader
        title="Document Types"
        description="Classify what a document is (Article, Technical Specification, Decision Record). When adding a type, create a routing rule so imports can resolve a repository section automatically."
      />
      <div className="grid two">
        <DocumentTypeCreatePanel
          onCreated={(_item, meta) => {
            if (meta.warning) {
              setError(meta.warning);
              setMessage('Document type created.');
            } else {
              setMessage(
                meta.routingRuleCreated
                  ? 'Document type and routing rule created.'
                  : 'Document type created.',
              );
              setError('');
            }
            void load();
          }}
        />
        <div className="panel">
          <div className="panel-header">
            <h2>Configured types</h2>
            <button type="button" className="button small" onClick={() => void load()}>Refresh</button>
          </div>
          {message ? <div className="notice success">{message}</div> : null}
          {error && !editing ? <div className="notice error">{error}</div> : null}
          {loading ? (
            <Loading />
          ) : items.length === 0 ? (
            <EmptyState title="No document types" text="Create the first document type on the left." />
          ) : (
            <div className="table-wrap">
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
                  {items.map((item) => {
                    const menuOpen = openMenuId === item.id;
                    const busy = busyId === item.id;
                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td><span className="mono">{item.code}</span></td>
                        <td>{item.description || '—'}</td>
                        <td><StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                        <td className={styles.actionsCell}>
                          <div className={styles.menuWrap}>
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
            </div>
          )}
        </div>
      </div>

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
  );
}
