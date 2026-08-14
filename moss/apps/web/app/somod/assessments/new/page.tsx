'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Layers,
  MapPin,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { Shell } from '../../../../components/Shell';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OrganisationSelect, type OrgOption } from '@/components/organisations/OrganisationSelect';
import { apiFetch } from '../../../../lib/api';
import { somodApiErrorMessage } from '../../../../lib/somod';

type Site = { id: string; name: string; siteCode: string };
type MossOption = {
  id: string;
  reference: string;
  title: string;
  status: string;
  organisation: { id: string; name: string };
};

const ADD_NEW_SITE = '__add_new_site__';

const ENGINE_PREVIEWS = [
  { key: 'risk', name: 'Risk / Requirement' },
  { key: 'deployment', name: 'Deployment / Capability' },
  { key: 'technology', name: 'Technology' },
  { key: 'cost', name: 'Cost / Efficiency' },
  { key: 'optimisation', name: 'Optimisation / Trade-off' },
] as const;

function NewSomodAssessmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [mossOptions, setMossOptions] = useState<MossOption[]>([]);
  const [organisationId, setOrganisationId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [mossAssessmentId, setMossAssessmentId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteSaving, setSiteSaving] = useState(false);
  const [siteForm, setSiteForm] = useState({
    name: '',
    siteCode: '',
    address: '',
    region: '',
    description: '',
  });
  const [siteError, setSiteError] = useState('');

  useEffect(() => {
    const prefOrg = searchParams.get('org') || '';
    const prefMoss = searchParams.get('moss') || '';
    setLoading(true);
    Promise.all([
      apiFetch<OrgOption[]>('/organisations'),
      apiFetch<MossOption[]>('/moss/assessments').catch(() => [] as MossOption[]),
    ])
      .then(([list, moss]) => {
        setOrgs(list.map((o) => ({ id: o.id, name: o.name })));
        setMossOptions(moss);
        if (prefOrg && list.some((o) => o.id === prefOrg)) setOrganisationId(prefOrg);
        if (prefMoss && moss.some((m) => m.id === prefMoss)) {
          const linked = moss.find((m) => m.id === prefMoss)!;
          setOrganisationId(linked.organisation.id);
          setMossAssessmentId(linked.id);
        }
      })
      .catch((e: unknown) => setError(somodApiErrorMessage(e, 'Unable to load organisations.')))
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    if (!organisationId) {
      setSites([]);
      setSiteId('');
      setMossAssessmentId('');
      return;
    }
    apiFetch<Site[]>(`/organisations/${organisationId}/sites`)
      .then((list) => {
        setSites(list);
        setSiteId('');
      })
      .catch(() => setSites([]));
  }, [organisationId]);

  useEffect(() => {
    if (!organisationId || !mossAssessmentId) return;
    const stillValid = mossOptions.some(
      (m) => m.id === mossAssessmentId && m.organisation.id === organisationId,
    );
    if (!stillValid) setMossAssessmentId('');
  }, [organisationId, mossAssessmentId, mossOptions]);

  const mossForOrg = mossOptions.filter((m) => m.organisation.id === organisationId);
  const selectedMoss = mossForOrg.find((m) => m.id === mossAssessmentId);

  async function createSite() {
    if (!organisationId || !siteForm.name.trim() || !siteForm.siteCode.trim()) {
      setSiteError('Site name and site code are required.');
      return;
    }
    setSiteSaving(true);
    setSiteError('');
    try {
      const site = await apiFetch<Site>(`/organisations/${organisationId}/sites`, {
        method: 'POST',
        body: JSON.stringify({
          name: siteForm.name.trim(),
          siteCode: siteForm.siteCode.trim(),
          address: siteForm.address.trim() || undefined,
          region: siteForm.region.trim() || undefined,
          description: siteForm.description.trim() || undefined,
        }),
      });
      setSites((prev) => [...prev, site]);
      setSiteId(site.id);
      setSiteModalOpen(false);
      setSiteForm({ name: '', siteCode: '', address: '', region: '', description: '' });
    } catch (err: unknown) {
      setSiteError(somodApiErrorMessage(err, 'Unable to create site.'));
    } finally {
      setSiteSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!organisationId) {
      setError('Organisation is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/somod/assessments', {
        method: 'POST',
        body: JSON.stringify({
          organisationId,
          siteId: siteId || undefined,
          mossAssessmentId: mossAssessmentId || undefined,
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      router.push(`/somod/assessments/${created.id}`);
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to create SOMOD assessment.'));
      setSaving(false);
    }
  }

  const selectedOrg = orgs.find((o) => o.id === organisationId);
  const selectedSite = sites.find((s) => s.id === siteId);

  return (
    <AuthGate>
      <Shell title="New SOMOD Assessment" subtitle="Security Operating Model Optimisation Diagnostic">
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              Create an optimisation diagnostic for an organisation. Optionally link a MOSS
              assessment for context, then configure engines and the financial layer (Screens
              A–E).
            </p>
            <Badge
              variant="secondary"
              className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold"
            >
              SOMOD · engines + financial
            </Badge>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Layers}
              title="Product"
              value="SOMOD"
              description="Dedicated aggregate"
              tone="violet"
              loading={loading}
            />
            <StatCard
              icon={SlidersHorizontal}
              title="Engines"
              value={5}
              description="Editable inputs"
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={Shield}
              title="Scenarios"
              value="4"
              description="Current · Risk · Cost · Optimal"
              tone="teal"
              loading={loading}
            />
            <StatCard
              icon={Building2}
              title="Organisations"
              value={orgs.length}
              description="Available to assess"
              tone="slate"
              loading={loading}
            />
          </div>

          <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Assessment details</CardTitle>
                <CardDescription>
                  Organisation is required. Site is optional and can be added for this organisation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="flex flex-col gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="somod-new-org">Organisation *</Label>
                    <OrganisationSelect
                      id="somod-new-org"
                      required
                      value={organisationId}
                      organisations={orgs}
                      onOrganisationsChange={setOrgs}
                      onChange={(id) => setOrganisationId(id)}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="somod-new-site">Site (optional)</Label>
                    <select
                      id="somod-new-site"
                      value={siteId}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === ADD_NEW_SITE) {
                          setSiteError('');
                          setSiteModalOpen(true);
                          return;
                        }
                        setSiteId(next);
                      }}
                      disabled={!organisationId || saving}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select site</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.siteCode} — {s.name}
                        </option>
                      ))}
                      {organisationId ? (
                        <option value={ADD_NEW_SITE}>+ Add new…</option>
                      ) : null}
                    </select>
                    {!organisationId ? (
                      <p className="text-xs text-slate-500">
                        Select an organisation to load or add sites.
                      </p>
                    ) : sites.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No sites yet — choose + Add new… in the dropdown.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="somod-new-moss">Linked MOSS assessment (optional)</Label>
                    <select
                      id="somod-new-moss"
                      value={mossAssessmentId}
                      onChange={(e) => setMossAssessmentId(e.target.value)}
                      disabled={!organisationId || saving}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">No MOSS link</option>
                      {mossForOrg.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.reference} — {m.title} ({m.status})
                        </option>
                      ))}
                    </select>
                    {!organisationId ? (
                      <p className="text-xs text-slate-500">
                        Select an organisation to choose a MOSS assessment from the same org.
                      </p>
                    ) : mossForOrg.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No MOSS assessments for this organisation yet.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Read-only context link — SOMOD stays a separate product aggregate.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="somod-new-title">Assessment title</Label>
                    <Input
                      id="somod-new-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Optional — defaults to organisation name"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="somod-new-notes">Notes</Label>
                    <Textarea
                      id="somod-new-notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional context for this optimisation diagnostic"
                      disabled={saving}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => router.push('/somod/assessments')}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!organisationId || saving}
                      className="bg-[#c41230] hover:bg-[#a10f28]"
                    >
                      {saving ? 'Creating…' : 'Create SOMOD assessment'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Layers className="size-4 text-[#c41230]" aria-hidden="true" />
                    Engine workspace
                  </CardTitle>
                  <CardDescription>
                    Five engines plus financial Screens A–E (setup, penalties, mappings, scenario
                    outputs, CFO dashboard) on the assessment workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ENGINE_PREVIEWS.map((engine) => (
                    <div
                      key={engine.key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-slate-900">{engine.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        Editable
                      </Badge>
                    </div>
                  ))}
                  <p className="mb-0 pt-1 text-xs leading-relaxed text-slate-500">
                    Scenario outputs: Current · Risk-Aligned · Cost-Efficient · Recommended
                    Optimal — driven by engines and the governed financial model.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="size-4 text-[#c41230]" aria-hidden="true" />
                    Selection summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Organisation
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {selectedOrg?.name || 'Not selected'}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Site
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {selectedSite
                        ? `${selectedSite.siteCode} — ${selectedSite.name}`
                        : 'Optional — none selected'}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Linked MOSS
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {selectedMoss
                        ? `${selectedMoss.reference} — ${selectedMoss.title}`
                        : 'Optional — none linked'}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Title
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {title.trim() || selectedOrg?.name || 'Will default to organisation name'}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Notes
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {notes.trim() || 'None'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Dialog open={siteModalOpen} onOpenChange={setSiteModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add new site</DialogTitle>
              <DialogDescription>
                Sites belong to the selected organisation and can be reused across diagnostics.
              </DialogDescription>
            </DialogHeader>
            {siteError ? <p className="error">{siteError}</p> : null}
            <div className="grid gap-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="somod-site-name">Site name *</Label>
                <Input
                  id="somod-site-name"
                  value={siteForm.name}
                  onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="somod-site-code">Site code *</Label>
                <Input
                  id="somod-site-code"
                  value={siteForm.siteCode}
                  onChange={(e) => setSiteForm((f) => ({ ...f, siteCode: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="somod-site-address">Address</Label>
                <Input
                  id="somod-site-address"
                  value={siteForm.address}
                  onChange={(e) => setSiteForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="somod-site-region">Region</Label>
                <Input
                  id="somod-site-region"
                  value={siteForm.region}
                  onChange={(e) => setSiteForm((f) => ({ ...f, region: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="somod-site-description">Description</Label>
                <Textarea
                  id="somod-site-description"
                  rows={3}
                  value={siteForm.description}
                  onChange={(e) => setSiteForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setSiteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={siteSaving}
                className="bg-[#c41230] hover:bg-[#a10f28]"
                onClick={() => void createSite()}
              >
                {siteSaving ? 'Saving…' : 'Save site'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}

export default function NewSomodAssessmentPage() {
  return (
    <Suspense
      fallback={
        <AuthGate>
          <Shell title="New SOMOD Assessment">
            <p className="text-sm text-slate-500">Loading…</p>
          </Shell>
        </AuthGate>
      }
    >
      <NewSomodAssessmentForm />
    </Suspense>
  );
}
