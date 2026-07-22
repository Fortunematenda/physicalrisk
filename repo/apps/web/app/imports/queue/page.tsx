'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';

type QueueItem = {
  id: string;
  fileName: string;
  status: string;
  errorMessage?: string | null;
  createdAt?: string;
  project?: { code?: string; name?: string } | null;
  sourceSystem?: { name?: string } | null;
  resolvedSection?: { name?: string } | null;
};

export default function ImportQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api('/imports?status=DRAFT')
      .then((data) => setItems(data as QueueItem[]))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load import queue.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <>
      <PageHeader
        title="Import Queue"
        description="Saved drafts waiting to be continued. Failed imports appear only in Import Logs."
        action={{ label: 'Import document', href: '/imports/new' }}
      />
      {error ? <div className="notice error">{error}</div> : null}
      <div className="panel">
        <div className="panel-header">
          <h2>Open drafts</h2>
          <button type="button" className="button small" onClick={load}>Refresh</button>
        </div>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="Queue is clear" text="There are no saved drafts to continue." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Project</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Routing</th>
                  <th>Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/imports/${item.id}`} className="primary-text">{item.fileName}</Link>
                    </td>
                    <td>{item.project?.code ?? '—'}</td>
                    <td>{item.sourceSystem?.name ?? '—'}</td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>{item.resolvedSection?.name ?? '—'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <Link className="button small primary" href={`/imports/new?continue=${encodeURIComponent(item.id)}`}>
                        Continue
                      </Link>
                    </td>
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
