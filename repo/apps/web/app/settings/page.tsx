'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { api, formatBytes } from '@/lib/api';

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
      <PageHeader title="Settings" description="API health and repository storage status." />
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
