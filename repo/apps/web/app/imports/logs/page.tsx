'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { api, formatDate } from '@/lib/api';

type ImportLogItem = {
  id: string;
  fileName: string;
  status: string;
  provider?: string | null;
  externalImportStatus?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  project?: { code?: string; name?: string } | null;
  sourceSystem?: { name?: string } | null;
  resolvedSection?: { name?: string } | null;
  sourceConnection?: { name?: string } | null;
};

export default function ImportLogsPage() {
  const [items, setItems] = useState<ImportLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api('/imports')
      .then((data) => {
        const rows = (data as ImportLogItem[]).filter((item) => item.status !== 'DRAFT');
        setItems(rows);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load Import Logs.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <>
      <PageHeader
        title="Import Logs"
        description="Failed and completed import history across manual uploads and External Imports."
        action={{ label: 'Import Queue', href: '/imports/queue' }}
      />
      {error ? <div className="notice error">{error}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h2>Recent imports</h2>
          <button type="button" className="button small" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title="No import history"
            text="Completed and failed imports will appear here after documents are processed."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Project</th>
                  <th>Source</th>
                  <th>Repository Module</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th>Completed</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/imports/${item.id}`} className="primary-text">{item.fileName}</Link>
                      {item.provider ? (
                        <div className="secondary-text">{item.provider.replaceAll('_', ' ')}</div>
                      ) : null}
                    </td>
                    <td>{item.project?.code ?? item.project?.name ?? '—'}</td>
                    <td>{item.sourceConnection?.name ?? item.sourceSystem?.name ?? '—'}</td>
                    <td>{item.resolvedSection?.name ?? '—'}</td>
                    <td><StatusBadge value={item.status} /></td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{formatDate(item.completedAt)}</td>
                    <td>
                      {item.errorMessage
                        ? <span className="secondary-text" title={item.errorMessage}>{item.errorMessage}</span>
                        : '—'}
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
