'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
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

const COMING_SOON = [
  { id: 'sharepoint', name: 'SharePoint', description: 'Microsoft SharePoint document libraries.' },
  { id: 'onedrive', name: 'OneDrive', description: 'Personal and business OneDrive folders.' },
  { id: 'dropbox', name: 'Dropbox', description: 'Dropbox team and shared folders.' },
  { id: 'sftp', name: 'SFTP', description: 'Secure file transfer from remote servers.' },
  { id: 'local-vps', name: 'Local VPS Folder', description: 'Watch a folder on the repository VPS volume.' },
] as const;

function providerLabel(provider?: string) {
  return (provider ?? 'UNKNOWN').replaceAll('_', ' ');
}

export default function SourceConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [connectName, setConnectName] = useState('Google Drive');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

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
        if (!confirm('Disconnect this Source Connection? Credentials will be removed.')) return;
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

  const connectGoogleDrive = async (event: FormEvent) => {
    event.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const result = await api<{ authUrl: string }>('/connectors/google-drive/connect', {
        method: 'POST',
        body: JSON.stringify({ name: connectName.trim() || 'Google Drive' }),
      });
      if (!result.authUrl) throw new Error('No OAuth URL was returned.');
      window.location.href = result.authUrl;
    } catch (caught) {
      const msg = caught instanceof ApiError
        ? caught.message
        : caught instanceof Error
          ? caught.message
          : 'Unable to start Google Drive connection.';
      setConnectError(msg);
      setConnecting(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Source Connections"
        description="Connect external repositories and sync Approved Documents into the Import Queue."
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
              <h3>Google Drive</h3>
              <p>OAuth connection with folder mapping, sync, and selective import.</p>
              <div className={styles.providerActions}>
                <button type="button" className="button primary small" onClick={() => {
                  setConnectName('Google Drive');
                  setConnectError('');
                  setShowConnect(true);
                }}>
                  Connect Google Drive
                </button>
              </div>
            </div>

            <div className={styles.providerCard}>
              <h3>ChatGPT MCP</h3>
              <p>Allow ChatGPT to list repository modules and submit Approved Documents via MCP.</p>
              <div className={styles.providerActions}>
                <Link href="/settings/mcp" className="button small primary">Open MCP Integrations</Link>
              </div>
            </div>

            <div className={styles.providerCard}>
              <h3>Manual Upload</h3>
              <p>Uses the Import Document page. No Source Connection record is required.</p>
              <div className={styles.providerActions}>
                <Link href="/imports/new" className="button small">Import Document</Link>
              </div>
            </div>

            {COMING_SOON.map((provider) => (
              <div key={provider.id} className={`${styles.providerCard} ${styles.disabled}`}>
                <h3>{provider.name}</h3>
                <p>{provider.description}</p>
                <div className={styles.providerActions}>
                  <button type="button" className="button small" disabled>Coming Soon</button>
                </div>
              </div>
            ))}
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
            text="Connect Google Drive or configure an MCP integration to begin importing from external sources."
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

      {showConnect ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (!connecting && event.target === event.currentTarget) setShowConnect(false);
          }}
        >
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="gdrive-connect-title">
            <form onSubmit={connectGoogleDrive}>
              <div className="modal-header">
                <h3 id="gdrive-connect-title">Connect Google Drive</h3>
              </div>
              <div className="modal-body">
                <p>Choose a display name, then continue to Google to authorise access.</p>
                <div className="field">
                  <label htmlFor="gdrive-name">Connection name</label>
                  <input
                    id="gdrive-name"
                    required
                    value={connectName}
                    onChange={(event) => setConnectName(event.target.value)}
                    disabled={connecting}
                  />
                </div>
                {connectError ? <div className="notice error" role="alert">{connectError}</div> : null}
              </div>
              <div className="modal-footer">
                <button type="button" className="button" disabled={connecting} onClick={() => setShowConnect(false)}>
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={connecting || !connectName.trim()}>
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
