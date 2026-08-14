'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  Copy,
  Layers,
  Lock,
  Pencil,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { Shell } from '../../../../components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '../../../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../../../lib/api';
import { mossApiErrorMessage } from '../../../../lib/moss';

type VersionRow = {
  id: string;
  version: string;
  status: string;
  title?: string;
  publishedAt?: string | null;
  domainCount?: number;
  controlCount?: number;
  assessmentCount?: number;
  readOnly?: boolean;
};

type DomainRow = {
  id: string;
  domainCode: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  controlCount?: number;
};

type ControlRow = {
  id: string;
  controlCode: string;
  name: string;
  domainCode: string;
  domainName: string;
  controlFunction?: string | null;
  owner?: string | null;
  frequency?: string | null;
  metric?: string | null;
  thresholdText?: string | null;
  sortOrder?: number;
};

type CataloguePayload = {
  id?: string;
  version?: string;
  status?: string;
  title?: string;
  description?: string | null;
  domainCount?: number;
  controlCount?: number;
  domains?: DomainRow[];
  controlRows?: ControlRow[];
  publishedAt?: string | null;
  note?: string;
  readOnly?: boolean;
  editable?: boolean;
  versions?: VersionRow[];
};

function suggestNextVersion(current?: string) {
  if (!current) return '3.1';
  const parts = current.split('.').map((p) => Number(p));
  if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
    parts[parts.length - 1] += 1;
    return parts.join('.');
  }
  return `${current}.1`;
}

function statusTone(status?: string) {
  if (status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'DRAFT') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

export default function MossCatalogueAdminPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<CataloguePayload | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [cloneVersion, setCloneVersion] = useState('3.1');
  const [cloneTitle, setCloneTitle] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [editingDomain, setEditingDomain] = useState<DomainRow | null>(null);
  const [editingControl, setEditingControl] = useState<ControlRow | null>(null);

  const load = useCallback(async (versionId?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
      const payload = await apiFetch<CataloguePayload>(`/moss/admin/catalogue${qs}`);
      setData(payload);
      setSelectedVersionId(payload.id || versionId || '');
      if (payload.version) setCloneVersion(suggestNextVersion(payload.version));
      setCloneTitle((prev) => prev || payload.title || '');
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to load MOSS catalogue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const domainRows = useMemo(() => (Array.isArray(data?.domains) ? data.domains : []), [data]);
  const controlRows = useMemo(
    () => (Array.isArray(data?.controlRows) ? data.controlRows : []),
    [data],
  );
  const versions = useMemo(() => data?.versions || [], [data]);
  const editable = Boolean(data?.editable || data?.status === 'DRAFT');
  const domainCount = data?.domainCount ?? domainRows.length;
  const controlCount = data?.controlCount ?? controlRows.length;

  const filteredDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domainRows;
    return domainRows.filter((d) =>
      [d.domainCode, d.name, d.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [domainRows, search]);

  const domainControls = useMemo(() => {
    if (!selectedDomainId) return [];
    const domain = domainRows.find((d) => d.id === selectedDomainId);
    if (!domain) return [];
    return controlRows.filter((c) => c.domainCode === domain.domainCode);
  }, [controlRows, domainRows, selectedDomainId]);

  const publishedLabel = data?.publishedAt
    ? new Date(data.publishedAt).toLocaleString()
    : '—';

  async function onClone() {
    if (!selectedVersionId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const workspace = await apiFetch<CataloguePayload>(
        `/moss/admin/catalogue/versions/${selectedVersionId}/clone`,
        {
          method: 'POST',
          body: JSON.stringify({
            version: cloneVersion.trim(),
            title: cloneTitle.trim() || undefined,
          }),
        },
      );
      setNotice(`Draft v${workspace.version} created. Edit freely, then publish.`);
      await load(workspace.id);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to clone catalogue.'));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!selectedVersionId || !editable) return;
    const ok = await confirm({
      title: 'Publish catalogue',
      description: `Publish catalogue v${data?.version}? This becomes the live catalogue for new assessments. Existing assessments keep their bound version.`,
      confirmLabel: 'Publish',
      variant: 'default',
    });
    if (!ok) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const workspace = await apiFetch<CataloguePayload>(
        `/moss/admin/catalogue/versions/${selectedVersionId}/publish`,
        { method: 'POST' },
      );
      setNotice(`Published v${workspace.version}. New assessments will use this version.`);
      await load(workspace.id);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to publish catalogue.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveDomain() {
    if (!editingDomain) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/moss/admin/catalogue/domains/${editingDomain.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingDomain.name,
          description: editingDomain.description ?? null,
        }),
      });
      setEditingDomain(null);
      setNotice('Domain updated.');
      await load(selectedVersionId);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to update domain.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveControl() {
    if (!editingControl) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/moss/admin/catalogue/controls/${editingControl.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingControl.name,
          controlFunction: editingControl.controlFunction ?? null,
          owner: editingControl.owner ?? null,
          frequency: editingControl.frequency ?? null,
          metric: editingControl.metric ?? null,
          thresholdText: editingControl.thresholdText ?? null,
        }),
      });
      setEditingControl(null);
      setNotice('Control updated.');
      await load(selectedVersionId);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to update control.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <Shell title="MOSS Catalogue" subtitle="Versioned Master Catalogue" hideSearch>
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              Clone a published version to edit safely. Assessments stay bound to the catalogue
              version they were created with.
            </p>
            <Badge
              variant="secondary"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${statusTone(data?.status)}`}
            >
              {editable ? (
                <Pencil className="size-3.5" aria-hidden="true" />
              ) : (
                <Lock className="size-3.5" aria-hidden="true" />
              )}
              {data?.status || '—'} · v{data?.version || '—'}
            </Badge>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {notice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {notice}
            </p>
          ) : null}

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Catalogue version</CardTitle>
              <CardDescription>
                Select a version to inspect. Clone published/archived versions into a draft to edit.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="catalogue-version">Version</Label>
                <select
                  id="catalogue-version"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={selectedVersionId}
                  disabled={loading || busy || versions.length === 0}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedVersionId(id);
                    setSelectedDomainId(null);
                    void load(id);
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.status}
                      {typeof v.assessmentCount === 'number'
                        ? ` · ${v.assessmentCount} assessment${v.assessmentCount === 1 ? '' : 's'}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {editable ? (
                  <Button type="button" disabled={busy || loading} onClick={() => void onPublish()}>
                    <Upload className="size-4" aria-hidden="true" />
                    Publish draft
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {!editable ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Clone to draft</CardTitle>
                <CardDescription>
                  Creates a deep copy you can edit. Source version stays immutable for existing
                  assessments.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="clone-version">New version</Label>
                  <Input
                    id="clone-version"
                    value={cloneVersion}
                    onChange={(e) => setCloneVersion(e.target.value)}
                    placeholder="3.1"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clone-title">Title (optional)</Label>
                  <Input
                    id="clone-title"
                    value={cloneTitle}
                    onChange={(e) => setCloneTitle(e.target.value)}
                    placeholder={data?.title || 'Master Catalogue'}
                    disabled={busy}
                  />
                </div>
                <Button
                  type="button"
                  disabled={busy || loading || !cloneVersion.trim()}
                  onClick={() => void onClone()}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Clone
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={BookOpen}
              title="Catalogue version"
              value={data?.version ? `v${data.version}` : '—'}
              description={data?.title || 'Master Catalogue'}
              tone="violet"
              loading={loading}
            />
            <StatCard
              icon={Layers}
              title="Domains"
              value={domainCount}
              description={editable ? 'Editable draft domains' : 'Domain groups'}
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={ShieldCheck}
              title="Controls"
              value={controlCount}
              description={editable ? 'Editable draft controls' : 'Scored control catalogue'}
              tone="teal"
              loading={loading}
            />
            <StatCard
              icon={CalendarClock}
              title="Status"
              value={data?.status || '—'}
              description={publishedLabel}
              tone="slate"
              loading={loading}
            />
          </div>

          <Card
            className={`rounded-xl shadow-sm ${
              editable
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <CardContent className="flex gap-3 p-4 sm:items-start">
              <span
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                  editable ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {editable ? (
                  <Pencil className="size-4" aria-hidden="true" />
                ) : (
                  <Lock className="size-4" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">
                  {editable ? 'Draft catalogue — editing enabled' : 'Immutable catalogue version'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {data?.note ||
                    (editable
                      ? 'Change domain and control text, then publish when ready.'
                      : 'Clone to a new version to make changes without affecting past assessments.')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="gap-4 space-y-0 pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-lg">Domains</CardTitle>
                <CardDescription>
                  {loading
                    ? 'Loading catalogue domains…'
                    : `${filteredDomains.length} of ${domainRows.length} domains`}
                </CardDescription>
              </div>
              <div className="relative w-full max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search domains…"
                  className="pl-9"
                  aria-label="Search domains"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : filteredDomains.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title={domainRows.length === 0 ? 'No domains.' : 'No matching domains.'}
                  description={
                    domainRows.length === 0
                      ? 'Catalogue domains will appear once a version is available.'
                      : 'Try a different search term.'
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredDomains.map((domain) => {
                    const active = selectedDomainId === domain.id;
                    return (
                      <button
                        key={domain.id || domain.domainCode}
                        type="button"
                        onClick={() =>
                          setSelectedDomainId((prev) => (prev === domain.id ? null : domain.id))
                        }
                        className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                          active
                            ? 'border-slate-400 bg-white shadow-sm'
                            : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {domain.domainCode}
                          </Badge>
                          <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                            {domain.controlCount ?? 0}
                          </span>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold leading-snug text-slate-900">
                          {domain.name}
                        </h3>
                        {domain.description ? (
                          <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-500">
                            {domain.description}
                          </p>
                        ) : (
                          <p className="mt-1 flex-1 text-sm text-slate-400">No description</p>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="mb-0 text-xs font-medium text-slate-400">
                            {(domain.controlCount ?? 0) === 1
                              ? '1 control'
                              : `${domain.controlCount ?? 0} controls`}
                          </p>
                          {editable ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDomain({ ...domain });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingDomain({ ...domain });
                                }
                              }}
                            >
                              <Pencil className="size-3" aria-hidden="true" />
                              Edit
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedDomainId ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  Controls ·{' '}
                  {domainRows.find((d) => d.id === selectedDomainId)?.domainCode || 'Domain'}
                </CardTitle>
                <CardDescription>
                  {domainControls.length} control
                  {domainControls.length === 1 ? '' : 's'} in selected domain
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {domainControls.length === 0 ? (
                  <EmptyState
                    icon={ShieldCheck}
                    title="No controls in this domain."
                    description="Controls appear here once the catalogue version is loaded."
                  />
                ) : (
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Code</th>
                        <th className="px-2 py-2 font-semibold">Name</th>
                        <th className="px-2 py-2 font-semibold">Owner</th>
                        <th className="px-2 py-2 font-semibold">Frequency</th>
                        {editable ? <th className="px-2 py-2 font-semibold"> </th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {domainControls.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100 align-top">
                          <td className="px-2 py-2 font-mono text-xs text-slate-600">
                            {c.controlCode}
                          </td>
                          <td className="px-2 py-2 font-medium text-slate-900">{c.name}</td>
                          <td className="px-2 py-2 text-slate-600">{c.owner || '—'}</td>
                          <td className="px-2 py-2 text-slate-600">{c.frequency || '—'}</td>
                          {editable ? (
                            <td className="px-2 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingControl({ ...c })}
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                                Edit
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ) : null}

          {editingDomain ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <Card className="w-full max-w-lg rounded-xl shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Edit domain {editingDomain.domainCode}</CardTitle>
                  <CardDescription>Codes are fixed; names and descriptions can change.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="domain-name">Name</Label>
                    <Input
                      id="domain-name"
                      value={editingDomain.name}
                      onChange={(e) =>
                        setEditingDomain({ ...editingDomain, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domain-desc">Description</Label>
                    <Textarea
                      id="domain-desc"
                      rows={4}
                      value={editingDomain.description || ''}
                      onChange={(e) =>
                        setEditingDomain({ ...editingDomain, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditingDomain(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void saveDomain()}>
                      Save domain
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {editingControl ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
              <Card className="w-full max-w-xl rounded-xl shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Edit control {editingControl.controlCode}
                  </CardTitle>
                  <CardDescription>
                    Control codes stay fixed so assessments remain referential.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="control-name">Name</Label>
                    <Input
                      id="control-name"
                      value={editingControl.name}
                      onChange={(e) =>
                        setEditingControl({ ...editingControl, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="control-function">Function</Label>
                    <Input
                      id="control-function"
                      value={editingControl.controlFunction || ''}
                      onChange={(e) =>
                        setEditingControl({
                          ...editingControl,
                          controlFunction: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="control-owner">Owner</Label>
                    <Input
                      id="control-owner"
                      value={editingControl.owner || ''}
                      onChange={(e) =>
                        setEditingControl({ ...editingControl, owner: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="control-frequency">Frequency</Label>
                    <Input
                      id="control-frequency"
                      value={editingControl.frequency || ''}
                      onChange={(e) =>
                        setEditingControl({ ...editingControl, frequency: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="control-metric">Metric</Label>
                    <Input
                      id="control-metric"
                      value={editingControl.metric || ''}
                      onChange={(e) =>
                        setEditingControl({ ...editingControl, metric: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="control-threshold">Threshold</Label>
                    <Textarea
                      id="control-threshold"
                      rows={3}
                      value={editingControl.thresholdText || ''}
                      onChange={(e) =>
                        setEditingControl({
                          ...editingControl,
                          thresholdText: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditingControl(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void saveControl()}>
                      Save control
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </Shell>
    </AuthGate>
  );
}
