'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Activity, Cable, CheckCircle2, Clock } from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { IconSave, IconZap } from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useSidebarUser } from '@/components/layout/app-sidebar';
import { CrmSyncHistory, StatusPill, type HistoryFeedback } from '@/components/crm/CrmSyncHistory';
import { apiFetch } from '../../../lib/api';
import { safeExternalNavUrl } from '../../../lib/navigation';
import {
  CHECK_COPY,
  CONNECTION_COPY,
  HISTORY_COPY,
  SYNC_COPY,
  describeSync,
  formatDateTime,
  formatDateTimeFull,
  type CrmAccess,
  type CrmAdminSettings,
  type CrmConnectionTestResult,
  type CrmIntegrationStatus,
} from '../../../lib/crm-integration';

type Feedback = HistoryFeedback;

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
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const setFeedback = useCallback(
    (feedback: Feedback | null) => {
      if (!feedback) return;
      toast({
        id: 'crm-feedback',
        variant: feedback.kind,
        title: feedback.title,
        description: feedback.detail,
        duration: feedback.kind === 'success' && feedback.detail ? 8000 : undefined,
      });
    },
    [toast],
  );

  const [settings, setSettings] = useState<CrmAdminSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');

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

  const onJobSettled = useCallback(() => {
    void loadStatus();
  }, [loadStatus]);

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
        {!accessLoading && !crmUrl ? (
          <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm" aria-label="EspoCRM access">
            <p id="crm-access-reason" className="font-medium text-amber-800">
              {access?.message || 'The EspoCRM link is not available to your account.'}
            </p>
          </section>
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
                        {testing && check.id !== 'worker' ? 'Checking…' : check.statusLabel ?? copy.label}
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
                    ? `Sync worker runs every ${status.worker.intervalMinutes} minutes. Last run ${formatDateTime(status.worker.lastRunAt)} processed ${status.worker.lastProcessed ?? 0} job(s).`
                    : `Sync worker runs every ${status.worker.intervalMinutes} minutes when automatic sync is on. No run recorded yet.`}
                </p>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">Most recent failed attempt</h3>
                {status.sync.lastFailureAt ? (
                  <div className="mt-1 text-sm text-slate-700">
                    <p>
                      <time dateTime={status.sync.lastFailureAt} title={formatDateTimeFull(status.sync.lastFailureAt)}>
                        {formatDateTime(status.sync.lastFailureAt)}
                      </time>
                      {status.sync.lastFailureJob
                        ? ` · ${status.sync.lastFailureJob.recordType} ${status.sync.lastFailureJob.reference}`
                        : null}
                    </p>
                    {status.sync.lastFailureSummary ? <p className="text-red-800">{status.sync.lastFailureSummary}</p> : null}
                    {status.sync.lastFailureJob ? (
                      <p className="mt-1 text-slate-600">
                        {status.sync.lastFailureJob.currentStatus === 'success'
                          ? 'Resolved: a later attempt succeeded.'
                          : `Not resolved yet (job status: ${HISTORY_COPY[status.sync.lastFailureJob.currentStatus].label}). See Sync history below.`}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">No failed attempt recorded.</p>
                )}
              </>
            ) : (
              <p className="py-3 text-sm text-slate-600">{statusLoading ? 'Loading activity…' : 'Sync activity is unavailable.'}</p>
            )}
          </section>
        </div>

        <CrmSyncHistory onFeedback={setFeedback} onJobSettled={onJobSettled} />

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
