'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  message?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id?: string; name?: string; email?: string } | null;
};

export default function ImportLogsPage() {
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api('/audit-logs')
      .then((data) => setItems(data as AuditLogRow[]))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load audit logs.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const actions = useMemo(
    () => [...new Set(items.map((item) => item.action).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (actionFilter && item.action !== actionFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.action,
        item.entityType,
        item.entityId,
        item.message,
        item.user?.name,
        item.user?.email,
        item.ipAddress,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, actionFilter, query]);

  return (
    <>
      <PageHeader
        title="Import Logs"
        description="Persistent audit trail for imports, routing, versioning, configuration and related repository actions."
        action={{ label: 'Import document', href: '/imports/new' }}
      />
      {error ? <div className="notice error">{error}</div> : null}
      <div className="panel">
        <div className="panel-header">
          <h2>Audit events</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search action, entity, user…"
              aria-label="Search audit logs"
              style={{ minWidth: 220 }}
            />
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
            <button type="button" className="button small" onClick={load}>Refresh</button>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No audit events"
            text={items.length ? 'No events match the current filters.' : 'Import or configuration activity will appear here.'}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.createdAt)}</td>
                    <td><StatusBadge value={item.action} /></td>
                    <td>
                      <div>{item.entityType || '—'}</div>
                      {item.entityId ? (
                        <div className="secondary-text mono">
                          {item.entityType === 'Document' ? (
                            <Link href={`/documents/${item.entityId}`}>{item.entityId.slice(0, 8)}…</Link>
                          ) : item.entityType === 'ImportJob' ? (
                            <Link href={`/imports/${item.entityId}`}>{item.entityId.slice(0, 8)}…</Link>
                          ) : (
                            item.entityId.slice(0, 8) + '…'
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td>{item.user?.name || item.user?.email || 'System'}</td>
                    <td>{item.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
