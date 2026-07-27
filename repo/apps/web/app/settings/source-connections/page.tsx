'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';
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

type GoogleOAuthSettings = {
  clientId: string;
  redirectUri: string;
  clientSecretSet: boolean;
  source: 'database' | 'environment' | 'none';
  configured: boolean;
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
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [oauth, setOauth] = useState<GoogleOAuthSettings | null>(null);
  const [oauthForm, setOauthForm] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: 'https://repo.physicalrisk.com/api/connectors/google-drive/callback',
  });
  const [oauthSaving, setOauthSaving] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [oauthMessage, setOauthMessage] = useState('');

  const loadOauth = async () => {
    try {
      const settings = await api<GoogleOAuthSettings>('/connectors/google-oauth/settings');
      setOauth(settings);
      setOauthForm({
        clientId: settings.clientId || '',
        clientSecret: '',
        redirectUri: settings.redirectUri
          || 'https://repo.physicalrisk.com/api/connectors/google-drive/callback',
      });
    } catch (caught) {
      setOauthError(caught instanceof Error ? caught.message : 'Unable to load Google API settings.');
    }
  };

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
    void loadOauth();
  }, []);

  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (oauthResult === 'success') {
      setMessage('Google Drive connected. Open the connection below to set a root folder and sync — you do not need to Connect again.');
    } else if (oauthResult === 'error') {
      setError(`Google authorization failed (${searchParams.get('reason') || 'unknown'}). Try Connect again.`);
    }
  }, [searchParams]);

  const saveOauth = async (event: FormEvent) => {
    event.preventDefault();
    setOauthSaving(true);
    setOauthError('');
    setOauthMessage('');
    try {
      const payload: Record<string, string> = {
        clientId: oauthForm.clientId.trim(),
        redirectUri: oauthForm.redirectUri.trim(),
      };
      if (oauthForm.clientSecret.trim()) payload.clientSecret = oauthForm.clientSecret.trim();
      const updated = await api<GoogleOAuthSettings>('/connectors/google-oauth/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setOauth(updated);
      setOauthForm((current) => ({ ...current, clientSecret: '' }));
      setOauthMessage(
        updated.source === 'database'
          ? 'Google API settings saved. You can connect Google Drive now.'
          : 'Google API settings updated.',
      );
    } catch (caught) {
      setOauthError(caught instanceof Error ? caught.message : 'Unable to save Google API settings.');
    } finally {
      setOauthSaving(false);
    }
  };

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
          <h2>Google API settings</h2>
          <span className="secondary-text">
            {oauth?.configured
              ? `Configured (${oauth.source})`
              : 'Not configured — required before Connect Google Drive'}
          </span>
        </div>
        <form className="panel-body" onSubmit={saveOauth}>
          <p className="secondary-text" style={{ marginTop: 0 }}>
            Same pattern as SMTP: save Client ID and Client Secret here (from Google Cloud Console).
            Add authorized redirect URI in Google Cloud to match the value below.
          </p>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="google-client-id">Client ID</label>
              <input
                id="google-client-id"
                value={oauthForm.clientId}
                onChange={(e) => setOauthForm((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="xxxx.apps.googleusercontent.com"
                autoComplete="off"
                disabled={oauthSaving}
              />
            </div>
            <div className="field">
              <label htmlFor="google-client-secret">
                Client Secret{oauth?.clientSecretSet ? ' (leave blank to keep current)' : ''}
              </label>
              <input
                id="google-client-secret"
                type="password"
                value={oauthForm.clientSecret}
                onChange={(e) => setOauthForm((f) => ({ ...f, clientSecret: e.target.value }))}
                placeholder={oauth?.clientSecretSet ? '••••••••' : 'Enter client secret'}
                autoComplete="new-password"
                disabled={oauthSaving}
              />
            </div>
            <div className="field full">
              <label htmlFor="google-redirect-uri">Redirect URI</label>
              <input
                id="google-redirect-uri"
                value={oauthForm.redirectUri}
                onChange={(e) => setOauthForm((f) => ({ ...f, redirectUri: e.target.value }))}
                placeholder="https://repo.physicalrisk.com/api/connectors/google-drive/callback"
                autoComplete="off"
                disabled={oauthSaving}
              />
            </div>
          </div>
          {oauthError ? <div className="notice error">{oauthError}</div> : null}
          {oauthMessage ? <div className="notice success">{oauthMessage}</div> : null}
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={oauthSaving || !oauthForm.clientId.trim()}>
              {oauthSaving ? 'Saving…' : 'Save Google API settings'}
            </button>
          </div>
        </form>
      </div>

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
