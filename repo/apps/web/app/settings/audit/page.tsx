'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import { SettingsTabs } from '../settings-tabs';

type AuditUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
} | null;

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  message: string;
  createdAt: string;
  ipAddress?: string | null;
  user?: AuditUser;
};

type LogScope = 'system' | 'imports';

export default function SettingsAuditPage() {
  const [scope, setScope] = useState<LogScope>('system');
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = async (nextScope = scope) => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<AuditLogRow[]>(`/audit-logs?scope=${encodeURIComponent(nextScope)}&limit=200`);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load system logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(scope);
  }, [scope]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [
        item.action,
        item.entityType,
        item.entityId,
        item.message,
        item.user?.name,
        item.user?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Review administrator changes across configuration, users, integrations, and imports."
      />
      <SettingsTabs />

      <div className="panel">
        <div className="panel-header">
          <h2>{scope === 'system' ? 'System change logs' : 'Import logs'}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="inline-actions" style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`button small${scope === 'system' ? ' primary' : ''}`}
                onClick={() => setScope('system')}
              >
                System changes
              </button>
              <button
                type="button"
                className={`button small${scope === 'imports' ? ' primary' : ''}`}
                onClick={() => setScope('imports')}
              >
                Imports
              </button>
            </div>
            <button type="button" className="button small" onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="settings-logs-search">Search</label>
            <input
              id="settings-logs-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search action, entity, message, or admin"
            />
          </div>
          <p className="secondary-text" style={{ marginTop: 0 }}>
            {scope === 'system'
              ? 'Configuration, users, MCP integrations, and other administrator actions.'
              : 'Import-related audit events. For job details, open Import Queue.'}
          </p>
        </div>

        {error ? <div className="notice error" style={{ margin: '0 18px 16px' }}>{error}</div> : null}

        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div style={{ padding: 18 }}>
            <EmptyState
              title={scope === 'system' ? 'No system changes yet' : 'No import logs yet'}
              text={
                scope === 'system'
                  ? 'Admin changes to projects, templates, sources, users, and integrations will appear here.'
                  : 'Import activity will appear here after documents are processed.'
              }
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="logs-row">
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      {item.user?.name || item.user?.email || 'System'}
                      {item.user?.email && item.user?.name ? (
                        <div className="secondary-text">{item.user.email}</div>
                      ) : null}
                    </td>
                    <td><span className="mono">{item.action.replaceAll('_', ' ')}</span></td>
                    <td>
                      <span className="mono">{item.entityType}</span>
                      {item.entityId ? (
                        <div className="secondary-text mono" title={item.entityId}>
                          {item.entityId.slice(0, 8)}…
                        </div>
                      ) : null}
                    </td>
                    <td>{item.message}</td>
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
