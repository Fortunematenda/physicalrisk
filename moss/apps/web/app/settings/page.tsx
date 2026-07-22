'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Calculator,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  HardDrive,
  Mail,
  Plug,
  Save,
  Server,
  Tag,
  Users,
} from 'lucide-react';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/common/empty-state';
import { ResponsiveTabsList } from '@/components/common/responsive-tabs';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type SettingsSummary = {
  version: string;
  environment: string;
  database: string;
  fileStorage: string;
  totalUsers: number;
  activeUsers?: number;
  activeOrganisations: number;
  totalAssessments: number;
  lastBackupAt?: string | null;
  app: {
    name: string;
    description: string;
    url: string;
    email: string;
    timezone: string;
    currency: string;
  };
  email: {
    provider: string;
    host: string;
    port: string;
    user?: string;
    fromEmail: string;
    fromName: string;
    encryption: string;
    configured: boolean;
    passwordSet?: boolean;
    source?: 'database' | 'environment' | 'none';
  };
};

type MainTab = 'email' | 'integrations' | 'system';

const MAIN_TABS: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'email', label: 'Email', icon: <Mail className="size-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug className="size-4" /> },
  { id: 'system', label: 'System', icon: <Server className="size-4" /> },
];

function formatBackup(iso?: string | null) {
  if (!iso) return 'Not scheduled';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SummaryRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-moss-border/60 py-3 last:border-0">
      <span className="text-moss-muted">{icon}</span>
      <span className="flex-1 text-sm text-moss-muted">{label}</span>
      <span className={cn('text-sm font-semibold text-moss-text', valueClassName)}>{value}</span>
    </li>
  );
}

export default function SettingsPage() {
  const [summary, setSummary] = useState<SettingsSummary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('email');
  const [emailFailCount, setEmailFailCount] = useState(0);

  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '587',
    user: '',
    password: '',
    fromEmail: '',
    fromName: 'MOSS',
    encryption: 'STARTTLS' as 'STARTTLS' | 'SSL/TLS',
  });
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpSource, setSmtpSource] = useState<'database' | 'environment' | 'none'>('none');
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');

  useEffect(() => {
    apiFetch<SettingsSummary>('/admin/settings/summary')
      .then((data) => {
        setSummary(data);
        setSmtpForm({
          host: data.email.host || '',
          port: data.email.port || '587',
          user: data.email.user || '',
          password: '',
          fromEmail: data.email.fromEmail || '',
          fromName: data.email.fromName || 'MOSS',
          encryption: data.email.encryption === 'SSL/TLS' ? 'SSL/TLS' : 'STARTTLS',
        });
        setSmtpPasswordSet(Boolean(data.email.passwordSet));
        setSmtpSource(data.email.source || (data.email.configured ? 'environment' : 'none'));
        setTestRecipient(data.email.fromEmail || data.app.email || '');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    apiFetch<Array<{ uiStatus?: string; status?: string }> | { items: Array<{ uiStatus?: string; status?: string }> }>(
      '/admin/emails',
    )
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || [];
        setEmailFailCount(list.filter((j) => j.uiStatus === 'failed' || j.status === 'FAILED').length);
      })
      .catch(() => undefined);
  }, []);

  const filteredTabs = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    if (!q) return MAIN_TABS;
    return MAIN_TABS.filter((t) => t.label.toLowerCase().includes(q));
  }, [headerSearch]);

  useEffect(() => {
    if (!filteredTabs.some((t) => t.id === mainTab) && filteredTabs.length > 0) {
      setMainTab(filteredTabs[0].id);
    }
  }, [filteredTabs, mainTab]);

  async function saveSmtp() {
    setError('');
    setNotice('');
    setSavingSmtp(true);
    try {
      const payload: Record<string, unknown> = {
        host: smtpForm.host.trim(),
        port: Number(smtpForm.port) || 587,
        encryption: smtpForm.encryption,
        user: smtpForm.user.trim(),
        fromEmail: smtpForm.fromEmail.trim(),
        fromName: smtpForm.fromName.trim() || 'MOSS',
      };
      if (smtpForm.password.trim()) payload.password = smtpForm.password;
      const email = await apiFetch<SettingsSummary['email']>('/admin/settings/smtp', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSummary((prev) => (prev ? { ...prev, email } : prev));
      setSmtpForm((prev) => ({
        ...prev,
        host: email.host || '',
        port: email.port || '587',
        user: email.user || '',
        password: '',
        fromEmail: email.fromEmail || '',
        fromName: email.fromName || 'MOSS',
        encryption: email.encryption === 'SSL/TLS' ? 'SSL/TLS' : 'STARTTLS',
      }));
      setSmtpPasswordSet(Boolean(email.passwordSet));
      setSmtpSource(email.source || (email.configured ? 'database' : 'none'));
      setNotice('SMTP settings saved. Outbound mail will use these values immediately.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save SMTP settings.');
    } finally {
      setSavingSmtp(false);
    }
  }

  async function testEmail() {
    setError('');
    setNotice('');
    setTestingSmtp(true);
    try {
      const res = await apiFetch<{ message?: string }>('/admin/settings/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ to: testRecipient.trim() || undefined }),
      });
      setNotice(res.message || `Test email sent to ${testRecipient || 'your account'}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'SMTP test failed.');
    } finally {
      setTestingSmtp(false);
    }
  }

  const envTone =
    summary?.environment === 'Production'
      ? 'text-emerald-700'
      : summary?.environment === 'Test'
        ? 'text-amber-700'
        : 'text-slate-600';

  return (
    <AuthGate>
      <Shell
        title="Settings"
        hideEyebrow
        subtitle="Lean MVP configuration — email, integrations, and system status."
        searchPlaceholder="Search settings…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="mb-4">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className="space-y-6">
          <ResponsiveTabsList>
            {filteredTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </ResponsiveTabsList>

          {filteredTabs.length === 0 && (
            <EmptyState title="No matching settings" description="Try a different search term." />
          )}

          <TabsContent value="email" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Email Configuration</CardTitle>
                <CardDescription>
                  Configure SMTP for notifications and report delivery.
                  {smtpSource === 'database'
                    ? ' Currently using saved admin settings.'
                    : smtpSource === 'environment'
                      ? ' Currently using environment defaults until you save here.'
                      : ' Not configured yet.'}
                  {emailFailCount > 0 ? ` ${emailFailCount} failed email job(s) in the queue.` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mail Provider</Label>
                  <Input value={smtpForm.host.trim() ? 'SMTP' : 'Not configured'} readOnly disabled />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost">SMTP Host</Label>
                    <Input
                      id="smtpHost"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
                      placeholder="smtp.example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">SMTP Port</Label>
                    <Input
                      id="smtpPort"
                      value={smtpForm.port}
                      onChange={(e) => {
                        const port = e.target.value;
                        const n = Number(port);
                        setSmtpForm((f) => ({
                          ...f,
                          port,
                          encryption:
                            n === 465 ? 'SSL/TLS' : n === 587 ? 'STARTTLS' : f.encryption,
                        }));
                      }}
                      placeholder="587"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">Username</Label>
                    <Input
                      id="smtpUser"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, user: e.target.value }))}
                      placeholder="smtp-user@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      value={smtpForm.password}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={smtpPasswordSet ? '•••••••• (leave blank to keep)' : 'SMTP password'}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpFromEmail">From Email</Label>
                  <Input
                    id="smtpFromEmail"
                    type="email"
                    value={smtpForm.fromEmail}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, fromEmail: e.target.value }))}
                    placeholder="no-reply@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpFromName">From Name</Label>
                  <Input
                    id="smtpFromName"
                    value={smtpForm.fromName}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, fromName: e.target.value }))}
                    placeholder="MOSS"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpEncryption">Encryption</Label>
                  <select
                    id="smtpEncryption"
                    value={smtpForm.encryption}
                    onChange={(e) => {
                      const encryption = e.target.value === 'SSL/TLS' ? 'SSL/TLS' : 'STARTTLS';
                      setSmtpForm((f) => ({
                        ...f,
                        encryption,
                        port:
                          encryption === 'SSL/TLS' && (f.port === '587' || !f.port.trim())
                            ? '465'
                            : encryption === 'STARTTLS' && (f.port === '465' || !f.port.trim())
                              ? '587'
                              : f.port,
                      }));
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="STARTTLS">STARTTLS (port 587)</option>
                    <option value="SSL/TLS">SSL/TLS (port 465)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpTestTo">Test recipient</Label>
                  <Input
                    id="smtpTestTo"
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void saveSmtp()} disabled={savingSmtp || loading}>
                  <Save className="size-4" />
                  {savingSmtp ? 'Saving…' : 'Save SMTP Settings'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void testEmail()}
                  disabled={testingSmtp || loading || !smtpForm.host.trim()}
                >
                  <Mail className="size-4" />
                  {testingSmtp ? 'Sending…' : 'Test Email Settings'}
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/emails">
                    Email Logs
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>EspoCRM</CardTitle>
                <CardDescription>
                  Sync organisations, leads, contacts, opportunities and tasks with EspoCRM.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-moss-muted">
                  Manage connection status, sync queue, and failed jobs on the dedicated integrations page.
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild>
                  <Link href="/settings/integrations">
                    Open EspoCRM Integration
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SMTP status</CardTitle>
                <CardDescription>Outbound email transport used by the platform.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border border-moss-border p-4">
                  <div>
                    <p className="font-medium text-moss-text">{summary?.email.provider || 'SMTP'}</p>
                    <p className="text-sm text-moss-muted">
                      {summary?.email.configured
                        ? `${summary.email.host}:${summary.email.port} · ${summary.email.encryption}`
                        : 'Not configured — set SMTP in the Email tab'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-xs font-medium',
                      summary?.email.configured
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {summary?.email.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="button" variant="outline" onClick={() => setMainTab('email')}>
                  Configure Email
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="mt-0 space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>System Summary</CardTitle>
                  <CardDescription>Runtime environment and portfolio counts.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul>
                    <SummaryRow
                      icon={<Tag className="size-4" />}
                      label="Current Version"
                      value={loading ? '—' : summary?.version || '1.1.0'}
                    />
                    <SummaryRow
                      icon={<Server className="size-4" />}
                      label="Environment"
                      value={loading ? '—' : summary?.environment || 'Development'}
                      valueClassName={envTone}
                    />
                    <SummaryRow
                      icon={<Database className="size-4" />}
                      label="Database"
                      value={loading ? '—' : summary?.database}
                    />
                    <SummaryRow
                      icon={<HardDrive className="size-4" />}
                      label="File Storage"
                      value={loading ? '—' : summary?.fileStorage}
                    />
                    <SummaryRow
                      icon={<Users className="size-4" />}
                      label="Total Users"
                      value={loading ? '—' : summary?.totalUsers ?? 0}
                    />
                    <SummaryRow
                      icon={<Building2 className="size-4" />}
                      label="Active Organisations"
                      value={loading ? '—' : summary?.activeOrganisations ?? 0}
                    />
                    <SummaryRow
                      icon={<ClipboardList className="size-4" />}
                      label="Total Assessments"
                      value={loading ? '—' : summary?.totalAssessments ?? 0}
                    />
                    <SummaryRow
                      icon={<CheckCircle2 className="size-4" />}
                      label="Last Backup"
                      value={formatBackup(summary?.lastBackupAt)}
                    />
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void apiFetch<{ status?: string }>('/health')
                        .then((res) => setNotice(`System health: ${res.status || 'ok'}.`))
                        .catch((e: Error) => setError(e.message));
                    }}
                  >
                    View System Health
                    <ChevronRight className="size-4" />
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Admin shortcuts</CardTitle>
                  <CardDescription>MVP admin areas managed on dedicated pages.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link href="/admin/users">
                      <span className="inline-flex items-center gap-2">
                        <Users className="size-4" />
                        Users &amp; Roles
                      </span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link href="/admin/methodology">
                      <span className="inline-flex items-center gap-2">
                        <Calculator className="size-4" />
                        Methodology
                      </span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link href="/admin/assumptions">
                      <span className="inline-flex items-center gap-2">
                        <ClipboardList className="size-4" />
                        Assumptions
                      </span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link href="/admin/emails">
                      <span className="inline-flex items-center gap-2">
                        <Mail className="size-4" />
                        Email Logs
                      </span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Shell>
    </AuthGate>
  );
}
