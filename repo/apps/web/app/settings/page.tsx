'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { api, formatBytes } from '@/lib/api';
import { SettingsTabs } from './settings-tabs';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>();
  const [storage, setStorage] = useState<any>();

  useEffect(() => {
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/health`).then((r) =>
        r.json(),
      ),
      api('/storage/health'),
    ])
      .then(([h, v]) => {
        setHealth(h);
        setStorage(v);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Settings" description="System health, storage, integrations, and administrator logs." />
      <SettingsTabs />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Source Connections</h2>
        </div>
        <p style={{ margin: '0 0 12px' }}>
          Manage ChatGPT MCP integrations from Source Connections, and review imports in the Import Queue.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="button primary" href="/settings/source-connections">Source Connections</a>
          <a className="button" href="/imports/queue">Import Queue</a>
          <a className="button" href="/settings/audit">System logs</a>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="grid two">
          <div className="detail-card">
            <h2>Gateway health</h2>
            <dl className="detail-list">
              <dt>API status</dt>
              <dd>
                <span className="badge badge-active">{health?.status || 'Unknown'}</span>
              </dd>
              <dt>Service</dt>
              <dd>{health?.service || '—'}</dd>
              <dt>Timestamp</dt>
              <dd>{health?.timestamp || '—'}</dd>
            </dl>
          </div>

          <div className="detail-card">
            <h2>Storage</h2>
            <dl className="detail-list">
              <dt>Status</dt>
              <dd>
                <span className="badge badge-active">{storage?.status || 'Unknown'}</span>
              </dd>
              <dt>Writable</dt>
              <dd>{storage?.writable ? 'Yes' : 'No'}</dd>
              <dt>Storage root</dt>
              <dd className="mono">{storage?.storageRoot || '—'}</dd>
              <dt>Available</dt>
              <dd>{formatBytes(storage?.availableBytes)}</dd>
              <dt>Used</dt>
              <dd>{formatBytes(storage?.usedBytes)}</dd>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
