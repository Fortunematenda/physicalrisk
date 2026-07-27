'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import { useConfirm } from '@/components/confirm-dialog';
import styles from './SourceConnections.module.css';

type Connection = {
  id: string;
  name: string;
  provider: string;
  status: string;
  externalAccountLabel?: string | null;
  rootExternalFolderName?: string | null;
  defaultProject?: { id: string; code?: string; name?: string } | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
};

function providerLabel(provider?: string) {
  return (provider ?? 'UNKNOWN').replaceAll('_', ' ');
}

export default function SourceConnectionsPage() {
  const confirm = useConfirm();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<Connection[]>('/connectors');
      setConnections(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Source Connections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runAction = async (id: string, action: 'test' | 'sync' | 'disconnect') => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      if (action === 'disconnect') {
        const ok = await confirm({
          title: 'Disconnect source',
          message: 'Disconnect this Source Connection? Credentials will be removed.',
          confirmLabel: 'Disconnect',
          tone: 'danger',
        });
        if (!ok) return;
        await api(`/connectors/${id}`, { method: 'DELETE' });
        setMessage('Source Connection disconnected.');
      } else if (action === 'test') {
        const result = await api<{ ok?: boolean; message?: string }>(`/connectors/${id}/test`, { method: 'POST' });
        setMessage(result.message || (result.ok === false ? 'Connection test failed.' : 'Connection test succeeded.'));
      } else {
        await api(`/connectors/${id}/sync`, { method: 'POST' });
        setMessage('Sync started. Review Sync History on the connection detail page.');
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${action} Source Connection.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Source Connections"
        description="Manage ChatGPT MCP integrations and review connected sources."
      />

      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h2>Providers</h2>
        </div>
        <div className="panel-body">
          <div className={styles.providerGrid}>
            <div className={styles.providerCard}>
              <h3>ChatGPT MCP</h3>
              <p>Allow ChatGPT to list repository modules and submit Approved Documents via MCP.</p>
              <div className={styles.providerActions}>
                <Link href="/settings/mcp" className="button small primary">Open MCP Integrations</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Connections</h2>
          <button type="button" className="button small" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? (
          <Loading />
        ) : connections.length === 0 ? (
          <EmptyState
            title="No Source Connections yet"
            text="Open MCP Integrations to create a ChatGPT MCP API key."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Account</th>
                  <th>Root folder</th>
                  <th>Default project</th>
                  <th>Last sync</th>
                  <th>Last error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {connections.map((item) => {
                  const busy = busyId === item.id;
                  const disconnected = item.status === 'DISCONNECTED';
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/settings/source-connections/${item.id}`} className="primary-text">
                          {item.name}
                        </Link>
                        <div className="secondary-text">{providerLabel(item.provider)}</div>
                      </td>
                      <td><StatusBadge value={item.status} /></td>
                      <td>{item.externalAccountLabel || '—'}</td>
                      <td>{item.rootExternalFolderName || '—'}</td>
                      <td>{item.defaultProject?.code || item.defaultProject?.name || '—'}</td>
                      <td>{formatDate(item.lastSyncAt)}</td>
                      <td>
                        {item.lastSyncError
                          ? <span className="secondary-text" title={item.lastSyncError}>{item.lastSyncError}</span>
                          : '—'}
                      </td>
                      <td>
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || disconnected}
                            onClick={() => void runAction(item.id, 'test')}
                          >
                            {busy ? '…' : 'Test Connection'}
                          </button>
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || disconnected || item.status !== 'CONNECTED'}
                            onClick={() => void runAction(item.id, 'sync')}
                          >
                            Sync Now
                          </button>
                          <Link className="button small" href={`/settings/source-connections/${item.id}`}>
                            Configure
                          </Link>
                          <button
                            type="button"
                            className="button small danger"
                            disabled={busy || disconnected}
                            onClick={() => void runAction(item.id, 'disconnect')}
                          >
                            Disconnect
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
  );
}
