'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Building2,
  Layers,
  MapPin,
  ShieldCheck,
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
import { mossApiErrorMessage } from '../../../../lib/moss';

type Site = { id: string; name: string; siteCode: string };
type Catalogue = {
  version: string;
  domainCount?: number;
  controlCount?: number;
  domains?: number;
  controls?: number;
  title: string;
  status?: string;
};

const ADD_NEW_SITE = '__add_new_site__';

export default function NewMossAssessmentPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [organisationId, setOrganisationId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [title, setTitle] = useState('');
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
    setLoading(true);
    Promise.all([
      apiFetch<OrgOption[]>('/organisations'),
      apiFetch<Catalogue>('/moss/catalogue'),
    ])
      .then(([orgList, cat]) => {
        setOrgs(orgList.map((o) => ({ id: o.id, name: o.name })));
        setCatalogue(cat);
      })
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load form data.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!organisationId) {
      setSites([]);
      setSiteId('');
      return;
    }
    apiFetch<Site[]>(`/organisations/${organisationId}/sites`)
      .then((list) => {
        setSites(list);
        setSiteId('');
      })
      .catch(() => setSites([]));
  }, [organisationId]);

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
      setSiteError(mossApiErrorMessage(err, 'Unable to create site.'));
    } finally {
      setSiteSaving(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/moss/assessments', {
        method: 'POST',
        body: JSON.stringify({
          organisationId,
          siteId: siteId || undefined,
          title: title || undefined,
        }),
      });
      router.push(`/moss/assessments/${created.id}`);
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to create MOSS assessment.'));
      setSaving(false);
    }
  }

  const domains = catalogue?.domainCount ?? catalogue?.domains ?? 14;
  const controls = catalogue?.controlCount ?? catalogue?.controls ?? 100;
  const selectedOrg = orgs.find((o) => o.id === organisationId);
  const selectedSite = sites.find((s) => s.id === siteId);

  return (
    <AuthGate>
      <Shell title="New MOSS Assessment" subtitle="Bind organisation to Master Catalogue v3.0">
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              Create a control assessment bound to the published Master Catalogue. Catalogue
              version is fixed on create for this release.
            </p>
            <Badge variant="secondary" className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
              Catalogue v{catalogue?.version || '3.0'}
            </Badge>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={BookOpen}
              title="Catalogue version"
              value={catalogue?.version ? `v${catalogue.version}` : '—'}
              description={catalogue?.title || 'Master Catalogue'}
              tone="violet"
              loading={loading}
            />
            <StatCard
              icon={Layers}
              title="Domains"
              value={domains}
              description="Bound on create"
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={ShieldCheck}
              title="Controls"
              value={controls}
              description="Maturity scored 0–4"
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
                    <Label htmlFor="moss-new-org">Organisation *</Label>
                    <OrganisationSelect
                      id="moss-new-org"
                      required
                      value={organisationId}
                      organisations={orgs}
                      onOrganisationsChange={setOrgs}
                      onChange={(id) => setOrganisationId(id)}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="moss-new-site">Site (optional)</Label>
                    <select
                      id="moss-new-site"
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
                      disabled={!organisationId}
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
                      <p className="text-xs text-slate-500">Select an organisation to load or add sites.</p>
                    ) : sites.length === 0 ? (
                      <p className="text-xs text-slate-500">No sites yet — choose + Add new… in the dropdown.</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="moss-new-title">Assessment title</Label>
                    <Input
                      id="moss-new-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Optional — defaults to organisation name"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="submit"
                      disabled={!organisationId || saving}
                      className="bg-[#c41230] hover:bg-[#a10f28]"
                    >
                      {saving ? 'Creating…' : 'Create MOSS assessment'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="size-4 text-[#c41230]" aria-hidden="true" />
                    Catalogue binding
                  </CardTitle>
                  <CardDescription>
                    Fixed to published Master Catalogue for this MVP.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <span className="text-slate-500">Version</span>
                    <span className="font-semibold text-slate-900">
                      v{catalogue?.version || '3.0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <span className="text-slate-500">Status</span>
                    <Badge variant="success" className="rounded-md">
                      {catalogue?.status || 'PUBLISHED'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <span className="text-slate-500">Scope</span>
                    <span className="font-semibold text-slate-900">
                      {domains} domains · {controls} controls
                    </span>
                  </div>
                  <p className="mb-0 text-xs leading-relaxed text-slate-500">
                    The assessment is bound to this published catalogue on create. Draft
                    catalogue edit/publish is not enabled in this release.
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
                      Title
                    </p>
                    <p className="mt-1 mb-0 font-medium text-slate-900">
                      {title.trim() || selectedOrg?.name || 'Will default to organisation name'}
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
                Sites belong to the selected organisation and can be reused across MOSS assessments.
              </DialogDescription>
            </DialogHeader>
            {siteError ? <p className="error">{siteError}</p> : null}
            <div className="grid gap-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="moss-site-name">Site name *</Label>
                <Input
                  id="moss-site-name"
                  value={siteForm.name}
                  onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-site-code">Site code *</Label>
                <Input
                  id="moss-site-code"
                  value={siteForm.siteCode}
                  onChange={(e) => setSiteForm((f) => ({ ...f, siteCode: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-site-address">Address</Label>
                <Input
                  id="moss-site-address"
                  value={siteForm.address}
                  onChange={(e) => setSiteForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-site-region">Region</Label>
                <Input
                  id="moss-site-region"
                  value={siteForm.region}
                  onChange={(e) => setSiteForm((f) => ({ ...f, region: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-site-description">Description</Label>
                <Textarea
                  id="moss-site-description"
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
