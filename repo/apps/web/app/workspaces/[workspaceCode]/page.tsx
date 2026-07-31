'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { api, formatDate } from '@/lib/api';
import styles from '../../configuration/Configuration.module.css';

type Tab = 'overview' | 'documents' | 'validation' | 'jobs' | 'activity';

type Summary = {
  workspaceCode: string;
  name: string;
  projectCode?: string;
  projectName?: string;
  status: string;
  currentStep: string;
  totalDocuments: number;
  completedDocuments: number;
  remainingDocuments: number;
  progressPercent: number;
  createdByName?: string;
  updatedAt: string;
  documentsByStatus?: Record<string, number>;
  documents?: Array<{
    id: string;
    fileName: string;
    relativePath?: string | null;
    status: string;
    documentCode?: string | null;
    importJobId?: string | null;
  }>;
};

type Activity = {
  id: string;
  action: string;
  source: string;
  userName?: string | null;
  createdAt: string;
  correlationId?: string | null;
};

export default function WorkspaceDetailPage() {
  const params = useParams<{ workspaceCode: string }>();
  const workspaceCode = decodeURIComponent(params.workspaceCode || '');
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!workspaceCode) return;
    setLoading(true);
    setError('');
    try {
      const [sum, act] = await Promise.all([
        api<Summary>(`/workspaces/${encodeURIComponent(workspaceCode)}/summary`),
        api<Activity[]>(`/workspaces/${encodeURIComponent(workspaceCode)}/activity`),
      ]);
      setSummary(sum);
      setActivity(act);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load workspace');
    } finally {
      setLoading(false);
    }
  }, [workspaceCode]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: string, path: string) => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await api(`/workspaces/${encodeURIComponent(workspaceCode)}/${path}`, { method: 'POST' });
      setNotice(`${action} completed.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${action} failed`);
    } finally {
      setBusy('');
    }
  };

  if (loading && !summary) return <Loading label="Loading workspace…" />;
  if (!summary) {
    return (
      <div className={styles.page}>
        <PageHeader title="Workspace" description={workspaceCode} />
        {error ? <div className="notice error">{error}</div> : null}
        <Link href="/workspaces" className="button">Back to workspaces</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={summary.name}
        description={`${summary.workspaceCode} · ${summary.projectCode || 'Project'} · ${summary.currentStep}`}
      />
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyItems: 'center' }}>
          <div><StatusBadge value={summary.status} /></div>
          <div><strong>{summary.progressPercent}%</strong> · {summary.completedDocuments}/{summary.totalDocuments} documents</div>
          <div className="secondary-text">Updated {formatDate(summary.updatedAt)}</div>
          <div className="secondary-text">Created by {summary.createdByName || '—'}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <button type="button" className="button" disabled={!!busy} onClick={() => void run('Resume', 'resume')}>Continue Review</button>
          <button type="button" className="button" disabled={!!busy} onClick={() => void run('Validate', 'validate')}>Validate</button>
          <button type="button" className="button primary" disabled={!!busy} onClick={() => void run('Submit', 'submit')}>Submit Import</button>
          <button type="button" className="button" disabled={!!busy} onClick={() => void run('Pause', 'pause')}>Pause</button>
          <button type="button" className="button" disabled={!!busy} onClick={() => void run('Archive', 'archive')}>Archive</button>
          <Link href="/imports/queue" className="button">Open Import Queue</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['overview', 'documents', 'validation', 'jobs', 'activity'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'button primary small' : 'button small'}
            onClick={() => setTab(id)}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="card" style={{ padding: 16 }}>
          <p>Use this <strong>Workspace ID</strong> to continue from another Repo GPT conversation or MCP client:</p>
          <p className="mono" style={{ fontSize: 18 }}>{summary.workspaceCode}</p>
          <p className="secondary-text">
            ChatGPT conversation history is never the source of truth — resume by workspace code.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {JSON.stringify(summary.documentsByStatus || {}, null, 2)}
          </pre>
        </div>
      ) : null}

      {tab === 'documents' || tab === 'validation' || tab === 'jobs' ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Relative path</th>
                <th>Status</th>
                <th>Document</th>
                <th>Import job</th>
              </tr>
            </thead>
            <tbody>
              {(summary.documents || []).map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.fileName}</td>
                  <td><span className="mono">{doc.relativePath || '—'}</span></td>
                  <td><StatusBadge value={doc.status} /></td>
                  <td>
                    {doc.documentCode
                      ? <Link href={`/repository/index?search=${encodeURIComponent(doc.documentCode)}`}>{doc.documentCode}</Link>
                      : '—'}
                  </td>
                  <td className="mono">{doc.importJobId ? doc.importJobId.slice(0, 8) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Source</th>
                <th>User</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{row.action}</td>
                  <td>{row.source}</td>
                  <td>{row.userName || '—'}</td>
                  <td className="mono">{row.correlationId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
