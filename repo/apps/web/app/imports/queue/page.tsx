'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { useConfirm } from '@/components/confirm-dialog';
import { api, formatDate } from '@/lib/api';
import { isAdmin } from '@/lib/permissions';

type QueueItem = {
  id: string;
  fileName: string;
  status: string;
  provider?: string | null;
  externalImportStatus?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
  project?: { code?: string; name?: string } | null;
  sourceSystem?: { name?: string } | null;
  resolvedSection?: { name?: string } | null;
  sourceConnection?: { id?: string; name?: string; externalAccountLabel?: string | null } | null;
};

type Tab = 'drafts' | 'external';

function providerLabel(provider?: string | null) {
  if (!provider) return '—';
  return provider.replaceAll('_', ' ');
}

export default function ImportQueuePage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('drafts');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const path = tab === 'drafts' ? '/imports?status=DRAFT' : '/imports?review=true';
    api(path)
      .then((data) => setItems(data as QueueItem[]))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load Import Queue.'))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    setAdmin(isAdmin());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rejectImport = async (id: string) => {
    const reason = window.prompt('Reason for rejecting this External Import:');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/imports/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMessage('External Import rejected.');
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reject import.');
    } finally {
      setBusyId(null);
    }
  };

  const retryImport = async (id: string) => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await api(`/imports/${id}/retry`, { method: 'POST' });
      setMessage('Retry started.');
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to retry import.');
    } finally {
      setBusyId(null);
    }
  };

  const clearQueue = async (scope: 'drafts' | 'external' | 'all' | 'failed' | 'imported' | 'metrics') => {
    const labels: Record<typeof scope, string> = {
      drafts: 'all saved drafts',
      external: 'all External Imports awaiting review',
      all: 'the entire Import Queue (drafts and External Imports)',
      failed: 'all failed import records (resets Failed Imports on the dashboard)',
      imported: 'completed import history (resets Imported in Period; documents stay in the repository)',
      metrics: 'imported and failed history (resets both dashboard KPIs; documents stay)',
    };
    const ok = await confirm({
      title: scope === 'metrics' || scope === 'failed' || scope === 'imported'
        ? 'Clear import metrics'
        : 'Clear import queue',
      message: `Clear ${labels[scope]}? Staged files will be removed where applicable. Approved repository documents are not deleted.`,
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!ok) return;

    setClearing(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ cleared: number; scope: string }>('/imports/clear-queue', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      });
      setMessage(
        result.cleared > 0
          ? `Cleared ${result.cleared} item${result.cleared === 1 ? '' : 's'}.`
          : 'Nothing to clear.',
      );
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to clear.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Import Queue"
        description="Drafts and external imports awaiting review before entering the repository."
        action={{ label: 'Import document', href: '/imports/new' }}
      />
      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <div className="panel">
        <div className="tabs">
          <a
            href="#drafts"
            className={tab === 'drafts' ? 'active' : ''}
            onClick={(event) => {
              event.preventDefault();
              setTab('drafts');
            }}
          >
            Drafts
          </a>
          <a
            href="#external"
            className={tab === 'external' ? 'active' : ''}
            onClick={(event) => {
              event.preventDefault();
              setTab('external');
            }}
          >
            External Imports
          </a>
        </div>

        <div className="panel-header">
          <h2>{tab === 'drafts' ? 'Open drafts' : 'External Imports awaiting review'}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {admin ? (
              <>
                <button
                  type="button"
                  className="button small danger"
                  disabled={loading || clearing || items.length === 0}
                  onClick={() => void clearQueue(tab === 'drafts' ? 'drafts' : 'external')}
                >
                  {clearing ? 'Clearing…' : tab === 'drafts' ? 'Clear drafts' : 'Clear external queue'}
                </button>
                <button
                  type="button"
                  className="button small"
                  disabled={loading || clearing}
                  onClick={() => void clearQueue('all')}
                >
                  Clear all queues
                </button>
                <button
                  type="button"
                  className="button small danger"
                  disabled={loading || clearing}
                  onClick={() => void clearQueue('metrics')}
                >
                  Clear imported & failed history
                </button>
              </>
            ) : null}
            <button type="button" className="button small" onClick={load} disabled={loading || clearing}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title={tab === 'drafts' ? 'Queue is clear' : 'No External Imports'}
            text={
              tab === 'drafts'
                ? 'There are no saved drafts to continue.'
                : 'External Imports from Source Connections will appear here for review.'
            }
          />
        ) : tab === 'drafts' ? (
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
                    <td><StatusBadge value={item.status} /></td>
                    <td>{item.resolvedSection?.name ?? '—'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <Link
                        className="button small primary"
                        href={`/imports/new?continue=${encodeURIComponent(item.id)}`}
                      >
                        Continue
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Source provider</th>
                  <th>Source account / connection</th>
                  <th>Proposed project</th>
                  <th>Proposed repository module</th>
                  <th>Status</th>
                  <th>External import status</th>
                  <th>Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = busyId === item.id;
                  const accountLabel = item.sourceConnection?.externalAccountLabel
                    || item.sourceConnection?.name
                    || item.sourceSystem?.name
                    || '—';
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/imports/${item.id}`} className="primary-text">{item.fileName}</Link>
                      </td>
                      <td>{providerLabel(item.provider)}</td>
                      <td>{accountLabel}</td>
                      <td>{item.project?.code ?? item.project?.name ?? '—'}</td>
                      <td>{item.resolvedSection?.name ?? '—'}</td>
                      <td><StatusBadge value={item.status} /></td>
                      <td>
                        {item.externalImportStatus
                          ? <StatusBadge value={item.externalImportStatus} />
                          : '—'}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <Link
                            className="button small primary"
                            href={`/imports/new?continue=${encodeURIComponent(item.id)}`}
                          >
                            Review / Continue
                          </Link>
                          <button
                            type="button"
                            className="button small danger"
                            disabled={busy || clearing}
                            onClick={() => void rejectImport(item.id)}
                          >
                            Reject
                          </button>
                          {item.status === 'FAILED' ? (
                            <button
                              type="button"
                              className="button small"
                              disabled={busy || clearing}
                              onClick={() => void retryImport(item.id)}
                            >
                              Retry
                            </button>
                          ) : null}
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
    </>
  );
}
