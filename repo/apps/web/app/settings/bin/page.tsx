'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { useConfirm } from '@/components/confirm-dialog';
import { api, formatDate } from '@/lib/api';
import { canCreateConfiguration, getCurrentUser, isAdmin } from '@/lib/permissions';
import { SettingsTabs } from '../settings-tabs';

type BinRow = {
  id: string;
  code: string;
  title: string;
  documentType: string;
  deletedAt: string;
  purgeAfter: string | null;
  daysRemaining: number | null;
  versionCount: number;
  deletedBy?: { id?: string; name?: string | null; email?: string | null } | null;
  project?: { id: string; code: string; name: string } | null;
  section?: { id: string; name: string } | null;
};

export default function SettingsBinPage() {
  const confirm = useConfirm();
  const user = getCurrentUser();
  const canManage = canCreateConfiguration(user);
  const admin = isAdmin(user);

  const [items, setItems] = useState<BinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await api<BinRow[]>('/documents/bin');
      setItems(Array.isArray(rows) ? rows : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load recycle bin.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.code, item.title, item.documentType, item.project?.name, item.section?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [items, query]);

  const restore = async (item: BinRow) => {
    if (!admin) return;
    const ok = await confirm({
      title: 'Restore document',
      message: `Restore ${item.code} — ${item.title} to the repository?`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/documents/${item.id}/restore`, { method: 'POST' });
      setNotice(`Restored ${item.code}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restore document.');
    } finally {
      setBusyId(null);
    }
  };

  const permanentDelete = async (item: BinRow) => {
    if (!admin) return;
    const ok = await confirm({
      title: 'Delete forever',
      message: `Permanently delete ${item.code} — ${item.title}?\n\nThis cannot be undone. Files and versions will be removed from storage.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/documents/${item.id}/permanent`, { method: 'DELETE' });
      setNotice(`Permanently deleted ${item.code}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to permanently delete document.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Recycle bin"
        description="Deleted documents are kept for 30 days. Admins can restore them or permanently delete early."
      />
      <SettingsTabs />

      {!canManage ? (
        <EmptyState title="No access" text="Only importers and admins can view the recycle bin." />
      ) : (
        <>
          {error ? <div className="notice error">{error}</div> : null}
          {notice ? <div className="notice success">{notice}</div> : null}

          <div className="panel" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Search bin…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                style={{ flex: '1 1 220px', minWidth: 180 }}
              />
              <button type="button" className="button" onClick={() => void load()} disabled={loading}>
                Refresh
              </button>
            </div>
            <p style={{ margin: '12px 0 0', color: 'var(--muted)' }}>
              Items are removed automatically after 30 days. Files remain on disk until permanent delete or expiry.
            </p>
          </div>

          {loading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState title="Bin is empty" text="Deleted documents will appear here for 30 days." />
          ) : (
            <div className="panel" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Project</th>
                    <th>Deleted</th>
                    <th>Days left</th>
                    <th>Deleted by</th>
                    {admin ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{item.code}</td>
                      <td>
                        <div>{item.title}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {item.documentType}
                          {item.section?.name ? ` · ${item.section.name}` : ''}
                          {item.versionCount ? ` · ${item.versionCount} version(s)` : ''}
                        </div>
                      </td>
                      <td>
                        {item.project ? (
                          <Link href={`/repository/explorer?projectId=${item.project.id}`}>
                            {item.project.code}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{item.deletedAt ? formatDate(item.deletedAt) : '—'}</td>
                      <td>{item.daysRemaining == null ? '—' : item.daysRemaining}</td>
                      <td>{item.deletedBy?.name || item.deletedBy?.email || '—'}</td>
                      {admin ? (
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="button primary"
                              disabled={busyId === item.id}
                              onClick={() => void restore(item)}
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              className="button"
                              disabled={busyId === item.id}
                              onClick={() => void permanentDelete(item)}
                            >
                              Delete forever
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
