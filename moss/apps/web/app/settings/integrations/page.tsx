'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, Cable, CheckCircle2, Clock, ExternalLink, History, RefreshCw, XCircle } from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { IconSave, IconZap } from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { Switch } from '@/components/ui/switch';
import { useSidebarUser } from '@/components/layout/app-sidebar';
import { ApiError, apiFetch } from '../../../lib/api';
import { safeExternalNavUrl } from '../../../lib/navigation';
import {
  CHECK_COPY,
  CONNECTION_COPY,
  CRM_PAGE_INTRO,
  HISTORY_COPY,
  SYNC_COPY,
  TONE_CLASSES,
  describeSync,
  formatDateTime,
  type CrmAccess,
  type CrmAdminSettings,
  type CrmConnectionTestResult,
  type CrmHistoryPage,
  type CrmIntegrationStatus,
  type Tone,
} from '../../../lib/crm-integration';

type Feedback = { kind: 'success' | 'error'; title: string; detail?: string };

const HISTORY_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'skipped', label: 'Skipped' },
];

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function IntegrationsPage() {
  const user = useSidebarUser();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [access, setAccess] = useState<CrmAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [status, setStatus] = useState<CrmIntegrationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [testing, setTesting] = useState(false);

  const [settings, setSettings] = useState<CrmAdminSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const [history, setHistory] = useState<CrmHistoryPage | null>(null);
  const [historyHidden, setHistoryHidden] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    setAccessLoading(true);
    try {
      setAccess(await apiFetch<CrmAccess>('/integrations/espocrm/access'));
    } catch {
      setAccess(null);
    } finally {
      setAccessLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      setStatus(await apiFetch<CrmIntegrationStatus>('/integrations/espocrm/status'));
    } catch (e) {
      // Drop the previous snapshot so no stale "Verified" or "Up to date" remains on screen.
      setStatus(null);
      setStatusError(errorMessage(e, 'Integration status could not be loaded.'));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number, filter: string) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filter) params.set('status', filter);
      setHistory(await apiFetch<CrmHistoryPage>(`/integrations/espocrm/history?${params}`));
    } catch (e) {
      setHistory(null);
      if (e instanceof ApiError && e.status === 403) setHistoryHidden(true);
      else setHistoryError(errorMessage(e, 'Sync history could not be loaded.'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const applySettings = (s: CrmAdminSettings) => {
    setSettings(s);
    setEnabled(s.enabled);
    setBaseUrl(s.baseUrl || '');
    setApiKey('');
  };

  useEffect(() => {
    void loadAccess();
    void loadStatus();
  }, [loadAccess, loadStatus]);

  useEffect(() => {
    void loadHistory(historyPage, historyFilter);
  }, [loadHistory, historyPage, historyFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<CrmAdminSettings>('/integrations/espocrm/settings')
      .then(applySettings)
      .catch((e) => setSettingsError(errorMessage(e, 'Connection settings could not be loaded.')));
  }, [isAdmin]);

  async function testConnection() {
    setTesting(true);
    setFeedback(null);
    try {
      const result = await apiFetch<CrmConnectionTestResult>('/integrations/espocrm/test', { method: 'POST', body: '{}' });
      setFeedback({
        kind: 'success',
        title: `${result.message} · checked ${formatDateTime(result.checkedAt)}`,
        detail:
          'MOSS reached the EspoCRM API with its integration key. This does not confirm that individual users can sign in to EspoCRM, or that records sync end to end.',
      });
    } catch (e) {
      setFeedback({ kind: 'error', title: 'Connection test failed', detail: errorMessage(e, 'The connection test failed.') });
    } finally {
      await loadStatus();
      setTesting(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSettingsError('');
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = { enabled, baseUrl: baseUrl.trim() };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      applySettings(
        await apiFetch<CrmAdminSettings>('/integrations/espocrm/settings', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
      );
      setFeedback({ kind: 'success', title: 'Connection settings saved.', detail: 'Run a connection test to verify the new settings.' });
      await Promise.all([loadAccess(), loadStatus()]);
    } catch (e) {
      setSettingsError(errorMessage(e, 'Unable to save connection settings.'));
    } finally {
      setSaving(false);
    }
  }

  async function retryJob(id: string) {
    setRetryingId(id);
    setFeedback(null);
    try {
      const item = await apiFetch<{ status: keyof typeof HISTORY_COPY }>(`/integrations/espocrm/retry/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: '{}',
      });
      const outcome = HISTORY_COPY[item.status]?.label ?? item.status;
      setFeedback(
        item.status === 'success'
          ? { kind: 'success', title: 'Retry succeeded.', detail: 'The record was sent to EspoCRM.' }
          : { kind: 'error', title: `Retry finished with status: ${outcome}.`, detail: 'See the error summary in the history below.' },
      );
    } catch (e) {
      setFeedback({ kind: 'error', title: 'Retry not started', detail: errorMessage(e, 'The retry could not be started.') });
    } finally {
      setRetryingId(null);
      await Promise.all([loadHistory(historyPage, historyFilter), loadStatus()]);
    }
  }

  const crmUrl = access?.available ? safeExternalNavUrl(access.url) : null;
  const connection = status ? CONNECTION_COPY[status.connection.state] : null;
  const sync = status ? SYNC_COPY[status.sync.state] : null;

  const openCrmAction = crmUrl ? (
    <a className="btn" href={crmUrl} target="_blank" rel="noopener noreferrer" aria-label="Open EspoCRM (opens in a new tab)">
      Open EspoCRM <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <button
      type="button"
      className="btn"
      disabled
      aria-disabled="true"
      aria-describedby={accessLoading ? undefined : 'crm-access-reason'}
    >
      Open EspoCRM <span aria-hidden="true">↗</span>
    </button>
  );

  return (
    <AuthGate>
      <Shell
        title="EspoCRM Integration"
        hideEyebrow
        subtitle="Connection, sync health and sync history for MOSS and EspoCRM."
        actions={openCrmAction}
      >
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700" aria-label="About this page">
          <p>{CRM_PAGE_INTRO}</p>
          {!accessLoading && !crmUrl ? (
            <p id="crm-access-reason" className="mt-2 font-medium text-amber-800">
              {access?.message || 'The EspoCRM link is not available to your account.'}
            </p>
          ) : null}
        </section>

        <div aria-live="polite" className="mb-4 empty:hidden">
          {feedback?.kind === 'success' ? (
            <div role="status" className="flex gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <p className="font-semibold">{feedback.title}</p>
                {feedback.detail ? <p className="mt-1">{feedback.detail}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        {feedback?.kind === 'error' ? (
          <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <XCircle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <p className="font-semibold">{feedback.title}</p>
              {feedback.detail ? <p className="mt-1">{feedback.detail}</p> : null}
            </div>
          </div>
        ) : null}
        {statusError ? <p className="error mb-4" role="alert">{statusError}</p> : null}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Cable}
            title="API connection"
            value={testing ? 'Checking…' : connection?.label ?? 'Unavailable'}
            description={
              testing
                ? 'Connection test in progress'
                : status?.connection.checkedAt
                  ? `Last check ${formatDateTime(status.connection.checkedAt)}`
                  : 'No connection check recorded'
            }
            tone={testing || !connection ? 'slate' : connection.tone}
            loading={statusLoading && !testing}
            textWrap
          />
          <StatCard
            icon={Activity}
            title="Synchronisation"
            value={sync?.label ?? 'Unavailable'}
            description={status ? describeSync(status) : 'Status unavailable'}
            tone={sync?.tone ?? 'slate'}
            loading={statusLoading}
            textWrap
          />
          <StatCard
            icon={Clock}
            title="Last sync attempt"
            value={formatDateTime(status?.sync.lastAttemptAt)}
            description={
              status?.sync.lastFailureAt
                ? `Last failure ${formatDateTime(status.sync.lastFailureAt)}`
                : 'No failed attempt recorded'
            }
            tone="slate"
            loading={statusLoading}
            textWrap
          />
          <StatCard
            icon={CheckCircle2}
            title="Last successful sync"
            value={formatDateTime(status?.sync.lastSuccessAt)}
            description={
              status ? `${status.sync.counts.succeeded} record(s) sent successfully in total` : 'Status unavailable'
            }
            tone="slate"
            loading={statusLoading}
            textWrap
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="dash2-card" aria-labelledby="crm-checks-heading">
            <div className="dash2-card-head">
              <div>
                <h2 id="crm-checks-heading">Health checks</h2>
                <p>Each result comes from a recorded check. Nothing is assumed.</p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void testConnection()}
                  disabled={testing || !settings?.enabled}
                  aria-busy={testing}
                >
                  <IconZap />
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
              ) : null}
            </div>
            {status ? (
              <ul className="divide-y divide-slate-100">
                {status.checks.map((check) => {
                  const copy = CHECK_COPY[check.result];
                  return (
                    <li key={check.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{check.label}</p>
                        <p className="text-sm text-slate-600">{check.detail}</p>
                        <p className="text-xs text-slate-500">
                          {check.checkedAt ? `Checked ${formatDateTime(check.checkedAt)}` : 'No check time recorded'}
                        </p>
                      </div>
                      <StatusPill tone={testing && check.id !== 'worker' ? 'slate' : copy.tone}>
                        {testing && check.id !== 'worker' ? 'Checking…' : copy.label}
                      </StatusPill>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-3 text-sm text-slate-600">{statusLoading ? 'Loading checks…' : 'Health checks are unavailable.'}</p>
            )}
            {status?.connection.state === 'failed' && status.connection.message ? (
              <p className="mt-2 text-sm text-red-800">{status.connection.message}</p>
            ) : null}
          </section>

          <section className="dash2-card" aria-labelledby="crm-activity-heading">
            <div className="dash2-card-head">
              <div>
                <h2 id="crm-activity-heading">Sync activity</h2>
                <p>{status?.sync.direction ?? 'Outbound (MOSS → EspoCRM)'}</p>
              </div>
            </div>
            {status ? (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {[
                    ['Queued', status.sync.counts.pending],
                    ['Awaiting retry', status.sync.counts.retrying],
                    ['Processing', status.sync.counts.processing],
                    ['Failed (unresolved)', status.sync.counts.failedUnresolved],
                    ['Failed (all time)', status.sync.counts.failedTotal],
                    ['Skipped', status.sync.counts.skipped],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">Records sent successfully</h3>
                {status.sync.succeededByType.length ? (
                  <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                    {status.sync.succeededByType.map((t) => (
                      <li key={t.recordType} className="rounded border border-slate-200 px-2 py-1">
                        {t.recordType}: <strong>{t.count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">Not recorded</p>
                )}
                <p className="mt-4 text-sm text-slate-600">
                  {status.worker.lastRunAt
                    ? `Sync worker runs every ${status.worker.intervalMinutes} minutes. Last run ${formatDateTime(status.worker.lastRunAt)}: ${status.worker.lastProcessed ?? 0} job(s) processed.`
                    : `Sync worker runs every ${status.worker.intervalMinutes} minutes when automatic sync is on. No run recorded yet.`}
                </p>
                {status.sync.lastFailureSummary ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Most recent failure: <span className="text-red-800">{status.sync.lastFailureSummary}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="py-3 text-sm text-slate-600">{statusLoading ? 'Loading activity…' : 'Sync activity is unavailable.'}</p>
            )}
          </section>
        </div>

        {!historyHidden ? (
          <section className="dash2-card mb-6" aria-labelledby="crm-history-heading">
            <div className="dash2-card-head flex-wrap gap-3">
              <div>
                <h2 id="crm-history-heading" className="flex items-center gap-2">
                  <History className="size-4" aria-hidden="true" /> Sync history
                </h2>
                <p>Recorded sync jobs, newest first.</p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="crm-history-filter" className="text-sm text-slate-600">Status</label>
                <select
                  id="crm-history-filter"
                  value={historyFilter}
                  onChange={(e) => {
                    setHistoryFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                >
                  {HISTORY_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {historyError ? <p className="error" role="alert">{historyError}</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm" aria-busy={historyLoading}>
                <caption className="sr-only">EspoCRM sync history</caption>
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Date / time</th>
                    <th scope="col" className="py-2 pr-3">Record type</th>
                    <th scope="col" className="py-2 pr-3">Reference</th>
                    <th scope="col" className="py-2 pr-3">Status</th>
                    <th scope="col" className="py-2 pr-3">Error summary</th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history?.items.length ? (
                    history.items.map((item) => {
                      const copy = HISTORY_COPY[item.status];
                      return (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap py-2 pr-3">{formatDateTime(item.at)}</td>
                          <td className="py-2 pr-3">{item.recordType}</td>
                          <td className="py-2 pr-3">{item.reference}</td>
                          <td className="py-2 pr-3">
                            <StatusPill tone={copy.tone}>{copy.label}</StatusPill>
                            {item.nextRetryAt ? (
                              <span className="mt-1 block text-xs text-slate-500">Retry {formatDateTime(item.nextRetryAt)}</span>
                            ) : null}
                          </td>
                          <td className="max-w-xs py-2 pr-3 text-slate-600">{item.errorSummary ?? '—'}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap justify-end gap-2">
                              {item.crmUrl && safeExternalNavUrl(item.crmUrl) ? (
                                <a
                                  href={safeExternalNavUrl(item.crmUrl)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-[#c41230] hover:underline"
                                  aria-label={`View ${item.recordType} ${item.reference} in EspoCRM (opens in a new tab)`}
                                >
                                  View <ExternalLink className="size-3.5" aria-hidden="true" />
                                </a>
                              ) : null}
                              {item.canRetry ? (
                                <button
                                  type="button"
                                  className="btn secondary"
                                  onClick={() => void retryJob(item.id)}
                                  disabled={retryingId !== null}
                                  aria-label={`Retry ${item.recordType} ${item.reference}`}
                                >
                                  <RefreshCw className={`size-3.5 ${retryingId === item.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                                  {retryingId === item.id ? 'Retrying…' : 'Retry'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-600">
                        {historyLoading ? 'Loading history…' : 'No sync jobs recorded.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {history && history.totalPages > 1 ? (
              <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Sync history pages">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyLoading || history.page <= 1}
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600" aria-live="polite">
                  Page {history.page} of {history.totalPages} · {history.total} job(s)
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyLoading || history.page >= history.totalPages}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </section>
        ) : null}

        {isAdmin ? (
          <details className="dash2-card group">
            <summary
              className="cursor-pointer select-none text-base font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Connection settings <span className="text-sm font-normal text-slate-500">(administrators)</span>
            </summary>
            <form className="mt-4 space-y-4" onSubmit={(e) => void saveSettings(e)}>
              {settingsError ? <p className="error" role="alert">{settingsError}</p> : null}
              <div className="flex items-center gap-3">
                <Switch id="crm-enabled" checked={enabled} onCheckedChange={setEnabled} aria-describedby="crm-enabled-help" />
                <label htmlFor="crm-enabled" className="font-medium text-slate-900">Integration enabled</label>
              </div>
              <p id="crm-enabled-help" className="-mt-2 text-sm text-slate-600">
                When off, MOSS sends nothing to EspoCRM. The Open EspoCRM link is unaffected.
              </p>
              <div className="field">
                <label htmlFor="crm-base-url">CRM base URL</label>
                <input
                  id="crm-base-url"
                  type="url"
                  inputMode="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://crm.example.com"
                  autoComplete="off"
                  aria-describedby="crm-base-url-help"
                />
                <p id="crm-base-url-help" className="mt-1 text-sm text-slate-600">
                  Must use HTTPS. Do not include credentials in the address.
                </p>
              </div>
              <div className="field">
                <label htmlFor="crm-api-key">Replace API key</label>
                <input
                  id="crm-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.apiKeyConfigured ? 'Leave blank to keep the current key' : 'Enter the EspoCRM API key'}
                  autoComplete="new-password"
                  aria-describedby="crm-api-key-help"
                />
                <p id="crm-api-key-help" className="mt-1 text-sm text-slate-600">
                  {settings?.apiKeyConfigured
                    ? 'An API key is configured. It is never shown. Leave this blank to keep it.'
                    : 'No API key is configured.'}
                </p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Sync timeout</dt>
                  <dd className="font-medium text-slate-900">{settings ? `${settings.timeoutSeconds} seconds` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Sync direction</dt>
                  <dd className="font-medium text-slate-900">{settings?.syncDirection ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Automatic sync</dt>
                  <dd className="font-medium text-slate-900">
                    {settings ? (settings.autoSync ? 'On — queued jobs retried every 10 minutes' : 'Off') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">TLS certificate verification</dt>
                  <dd className="font-medium text-slate-900">{settings ? (settings.verifySsl ? 'On' : 'Off') : '—'}</dd>
                </div>
              </dl>
              <p className="text-sm text-slate-600">
                Sync timeout, automatic sync and TLS verification are set in the deployment configuration.
              </p>
              <button type="submit" className="btn" disabled={saving || !settings} aria-busy={saving}>
                <IconSave />
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </form>
          </details>
        ) : null}
      </Shell>
    </AuthGate>
  );
}
