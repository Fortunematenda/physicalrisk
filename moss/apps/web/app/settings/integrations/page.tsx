'use client';

import { useEffect, useState } from 'react';
import {
  Cable,
  Clock,
} from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import {
  IconEye,
  IconInfo,
  IconSave,
  IconZap,
} from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../../lib/api';

type CrmStatus = {
  enabled?: boolean;
  connected?: boolean;
  baseUrlConfigured?: boolean;
  apiKeyConfigured?: boolean;
  baseUrl?: string | null;
  verifySsl?: boolean;
  timeoutSeconds?: number;
  autoSync?: boolean;
  syncDirection?: string;
  lastSuccessfulSync?: string | null;
  failedCount?: number;
  pendingCount?: number;
  retryingCount?: number;
  accountsSynced?: number;
  opportunitiesSynced?: number;
  healthScore?: number;
  apiReachable?: boolean | null;
  authValid?: boolean | null;
  sslValid?: boolean | null;
  queueWorkerRunning?: boolean | null;
};

function relativeTime(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HealthGauge({ score }: { score: number }) {
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 80 ? '#059669' : clamped >= 50 ? '#d97706' : '#c41230';

  return (
    <div className="crm2-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="46%" textAnchor="middle" className="crm2-gauge-value">{clamped}%</text>
        <text x="50%" y="62%" textAnchor="middle" className="crm2-gauge-label">Healthy</text>
      </svg>
    </div>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);

  const load = async () => {
    const s = await apiFetch<CrmStatus>('/integrations/espocrm/status');
    setStatus(s);
    setBaseUrl(s.baseUrl || '');
    setEnabled(Boolean(s.enabled));
    setApiKeySet(Boolean(s.apiKeyConfigured));
    setApiKey('');
  };

  useEffect(() => {
    void load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const payload: Record<string, unknown> = {
        enabled,
        baseUrl: baseUrl.trim(),
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const updated = await apiFetch<CrmStatus>('/integrations/espocrm/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setStatus(updated);
      setBaseUrl(updated.baseUrl || '');
      setEnabled(Boolean(updated.enabled));
      setApiKeySet(Boolean(updated.apiKeyConfigured));
      setApiKey('');
      setShowKey(false);
      setMessage('EspoCRM connection settings saved.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to save EspoCRM settings.');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await apiFetch<{ success?: boolean; ok?: boolean; message?: string; authenticatedUserName?: string | null }>(
        '/integrations/espocrm/test',
        { method: 'POST', body: '{}' },
      );
      const ok = Boolean(result.success ?? result.ok);
      setMessage(
        ok
          ? result.authenticatedUserName
            ? `EspoCRM connection succeeded (${result.authenticatedUserName}).`
            : result.message || 'EspoCRM connection succeeded.'
          : result.message || 'Connection test returned no result.',
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection test failed.');
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(
    status?.connected ?? (status?.enabled && status?.baseUrlConfigured && status?.apiKeyConfigured),
  );
  // Score must match the live checks shown below — not historic sync backlog.
  const checkApi = Boolean(status?.apiReachable ?? connected);
  const checkAuth = Boolean(status?.authValid ?? status?.apiKeyConfigured);
  const checkQueue = Boolean(status?.queueWorkerRunning ?? status?.enabled);
  const checkSsl = Boolean(status?.sslValid ?? status?.verifySsl !== false);
  const passedChecks = [checkApi, checkAuth, checkQueue, checkSsl].filter(Boolean).length;
  const health = Math.round((passedChecks / 4) * 100);

  return (
    <AuthGate>
      <Shell
        title="EspoCRM Integration"
        hideEyebrow
        subtitle="Configure the EspoCRM connection used for outbound lead, opportunity and follow-up synchronisation."
      >
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={{ marginBottom: 24 }}>
          <StatCard
            icon={Cable}
            title="Integration Status"
            value={connected ? 'Connected' : status?.enabled ? 'Degraded' : 'Disabled'}
            description={connected ? 'All systems operational' : 'Configure connection settings below'}
            tone={connected ? 'green' : 'amber'}
            loading={loading}
          />
          <StatCard
            icon={Clock}
            title="Last Successful Sync"
            value={relativeTime(status?.lastSuccessfulSync)}
            description={
              status?.lastSuccessfulSync
                ? formatDateTime(status.lastSuccessfulSync)
                : 'No sync yet'
            }
            tone="blue"
            loading={loading}
          />
        </div>

        <div className="crm2-board">
          <div className="crm2-board-primary">
            <section className="dash2-card crm2-settings">
              <div className="dash2-card-head">
                <div>
                  <h2>Connection Settings</h2>
                  <p>Admin-editable CRM Base URL and API Key (saved for the API runtime)</p>
                </div>
              </div>
              <div className="crm2-settings-grid">
                <div className="field">
                  <label>Integration Enabled</label>
                  <button
                    type="button"
                    className={`crm2-toggle ${enabled ? 'on' : ''}`}
                    onClick={() => setEnabled((v) => !v)}
                    aria-pressed={enabled}
                  >
                    <i />
                    <span>{enabled ? 'On' : 'Off'}</span>
                  </button>
                </div>
                <div className="field">
                  <label>SSL Verification</label>
                  <span className={`org2-status-badge ${status?.verifySsl !== false ? 'active' : 'inactive'}`}>
                    {status?.verifySsl !== false ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="crmBaseUrl">CRM Base URL</label>
                  <input
                    id="crmBaseUrl"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://crm.example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label>Sync Timeout</label>
                  <input readOnly value={`${status?.timeoutSeconds || 15}s`} />
                </div>
                <div className="field">
                  <label>API Authentication</label>
                  <input readOnly value={apiKeySet || apiKey.trim() ? 'API Key (configured)' : 'Not configured'} />
                </div>
                <div className="field">
                  <label>Auto Sync</label>
                  <span className={`org2-status-badge ${status?.autoSync ? 'active' : 'inactive'}`}>
                    {status?.autoSync ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="crmApiKey">API Key</label>
                  <div className="crm2-key-row">
                    <input
                      id="crmApiKey"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={apiKeySet ? '•••••••• (leave blank to keep)' : 'Enter EspoCRM API key'}
                      autoComplete="new-password"
                    />
                    <button type="button" className="reports2-icon-btn" onClick={() => setShowKey((v) => !v)} aria-label="Toggle key visibility">
                      <IconEye />
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Sync Direction <IconInfo /></label>
                  <input readOnly value={status?.syncDirection || 'Outbound (MOSS → EspoCRM)'} />
                </div>
              </div>
              <div className="crm2-settings-actions">
                <button type="button" className="btn" onClick={() => void saveSettings()} disabled={busy}>
                  <IconSave />
                  {busy ? 'Saving…' : 'Save Settings'}
                </button>
                <button type="button" className="btn secondary" onClick={() => void testConnection()} disabled={busy || !enabled}>
                  <IconZap />
                  Test Connection
                </button>
              </div>
            </section>

            <section className="dash2-card crm2-health-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Connection Health</h2>
                  <p>Live integration checks</p>
                </div>
                <span className={`org2-status-badge ${health >= 80 ? 'active' : 'inactive'}`}>
                  {health >= 80 ? 'Healthy' : 'Attention'}
                </span>
              </div>
              <HealthGauge score={health} />
              <ul className="crm2-health-list">
                <li><span>API Reachable</span><strong className={checkApi ? 'ok' : 'bad'}>{checkApi ? 'OK' : 'No'}</strong></li>
                <li><span>Authentication Valid</span><strong className={checkAuth ? 'ok' : 'bad'}>{checkAuth ? 'OK' : 'No'}</strong></li>
                <li><span>Queue Worker Running</span><strong className={checkQueue ? 'ok' : 'bad'}>{checkQueue ? 'OK' : 'No'}</strong></li>
                <li><span>Verify SSL Certificate</span><strong className={checkSsl ? 'ok' : 'bad'}>{checkSsl ? 'OK' : 'Off'}</strong></li>
              </ul>
              <button type="button" className="queue2-view-all" onClick={() => void testConnection()} disabled={busy}>
                Run Health Check
              </button>
            </section>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
