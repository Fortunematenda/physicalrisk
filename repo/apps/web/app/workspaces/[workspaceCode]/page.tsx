'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileStack,
  FolderKanban,
  RefreshCw,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import {
  ConfigurationListShell,
  configurationListStyles as styles,
} from '@/components/configuration-list-shell';
import { api, formatDate } from '@/lib/api';

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
  const [tab, setTab] = useState<Tab>('documents');
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

  const documents = summary?.documents || [];
  const emptyText = useMemo(() => {
    if (tab === 'activity') {
      return activity.length === 0
        ? { title: 'No activity yet', text: 'Workspace actions will appear here as you resume, validate, and submit.' }
        : null;
    }
    if (tab === 'overview') return null;
    return documents.length === 0
      ? { title: 'No documents attached', text: 'Attach or import documents into this workspace to continue review.' }
      : null;
  }, [tab, activity.length, documents.length]);

  if (loading && !summary) return <Loading />;
  if (!summary) {
    return (
      <ConfigurationListShell
        title="Workspace"
        description={workspaceCode}
        error={error}
        stats={[]}
        toolbar={(
          <Link href="/workspaces" className="button small">Back to workspaces</Link>
        )}
        loading={false}
        empty={{ title: 'Workspace not found', text: 'Check the workspace code and try again.' }}
      />
    );
  }

  return (
    <ConfigurationListShell
      title={summary.name}
      description={`${summary.workspaceCode} · ${summary.projectCode || 'Project'} · ${summary.currentStep.replaceAll('_', ' ')}`}
      headerAction={{ label: 'All workspaces', href: '/workspaces' }}
      error={error}
      message={notice}
      stats={[
        {
          label: 'Status',
          value: <StatusBadge value={summary.status} />,
          hint: `Step: ${summary.currentStep.replaceAll('_', ' ')}`,
          icon: <FolderKanban size={18} />,
          tone: 'blue',
        },
        {
          label: 'Progress',
          value: `${summary.progressPercent}%`,
          hint: `${summary.completedDocuments}/${summary.totalDocuments} documents`,
          icon: <CheckCircle2 size={18} />,
          tone: 'green',
        },
        {
          label: 'Documents',
          value: summary.totalDocuments,
          hint: `Updated ${formatDate(summary.updatedAt)}`,
          icon: <FileStack size={18} />,
          tone: 'orange',
        },
      ]}
      toolbar={(
        <>
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
          <button type="button" className="button small" disabled={!!busy} onClick={() => void run('Resume', 'resume')}>
            Continue Review
          </button>
          <button type="button" className="button small" disabled={!!busy} onClick={() => void run('Validate', 'validate')}>
            Validate
          </button>
          <button type="button" className="button primary small" disabled={!!busy} onClick={() => void run('Submit', 'submit')}>
            Submit Import
          </button>
          <button type="button" className="button small" disabled={!!busy} onClick={() => void run('Pause', 'pause')}>
            Pause
          </button>
          <button type="button" className="button small" disabled={!!busy} onClick={() => void run('Archive', 'archive')}>
            Archive
          </button>
          <Link href="/imports/queue" className="button small">Open Import Queue</Link>
          <button
            type="button"
            className={`button small ${styles.refresh}`}
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh workspace"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>
          <span className={styles.count}>
            {tab === 'activity' ? `${activity.length} events` : `${documents.length} documents`}
          </span>
        </>
      )}
      loading={loading && !summary}
      empty={tab === 'overview' ? null : emptyText}
      footer={null}
    >
      {tab === 'overview' ? (
        <div style={{ padding: '8px 4px 16px' }}>
          <p>Use this <strong>Workspace ID</strong> to continue from another Repo GPT conversation or MCP client:</p>
          <p className="mono" style={{ fontSize: 18 }}>{summary.workspaceCode}</p>
          <p className="secondary-text">
            Created by {summary.createdByName || '—'} · ChatGPT conversation history is never the source of truth — resume by workspace code.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 12 }}>
            {JSON.stringify(summary.documentsByStatus || {}, null, 2)}
          </pre>
        </div>
      ) : null}

      {(tab === 'documents' || tab === 'validation' || tab === 'jobs') && documents.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th className={styles.colPath}>Relative path</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colCode}>Document</th>
              <th>Import job</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div className={styles.title}>{doc.fileName}</div>
                </td>
                <td>
                  <span className={`mono ${styles.path}`} title={doc.relativePath || undefined}>
                    {doc.relativePath || '—'}
                  </span>
                </td>
                <td><StatusBadge value={doc.status} /></td>
                <td>
                  {doc.documentCode
                    ? (
                      <Link
                        className={`primary-text mono ${styles.docLink}`}
                        href={`/repository/index?search=${encodeURIComponent(doc.documentCode)}`}
                      >
                        {doc.documentCode}
                      </Link>
                    )
                    : '—'}
                </td>
                <td className="mono">{doc.importJobId ? doc.importJobId.slice(0, 8) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {tab === 'activity' && activity.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th className={styles.colDate}>When</th>
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
      ) : null}
    </ConfigurationListShell>
  );
}
