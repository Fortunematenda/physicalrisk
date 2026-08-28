'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';

const CONTACT_METHODS = [
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

const CONTACT_OUTCOMES = [
  { value: 'NO_RESPONSE', label: 'No response' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up required' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'WANTS_PROPOSAL', label: 'Wants proposal' },
  { value: 'NEEDS_MORE_INFORMATION', label: 'Needs more information' },
  { value: 'DEFERRED', label: 'Deferred' },
  { value: 'CLOSED', label: 'Closed' },
];

const INTEREST_OPTIONS = [
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'INTERESTED', label: 'Interested in Level 2' },
  { value: 'NEEDS_FOLLOW_UP', label: 'Needs follow-up' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'DEFERRED', label: 'Deferred' },
];

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function personName(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return '—';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || '—';
}

function proposalStatusLabel(status?: string) {
  if (!status) return '—';
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type Props = {
  submissionId: string;
  item: any;
  commercialOwners: any[];
  busy: boolean;
  onReload: () => Promise<void>;
  focusSection?: 'proposal' | 'contact' | null;
  onFocusHandled?: () => void;
};

export function TriageCommercialPanel({
  submissionId,
  item,
  commercialOwners,
  busy,
  onReload,
  focusSection,
  onFocusHandled,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    contactMethod: 'CALL',
    outcome: 'INTERESTED',
    notes: '',
    nextFollowUpAt: '',
  });
  const scope = item.scopeDiscussion || {};
  const [scopeDraft, setScopeDraft] = useState({
    clientObjectives: scope.clientObjectives || '',
    sitesOrBusinessUnits: scope.sitesOrBusinessUnits || '',
    indicativeScope: scope.indicativeScope || '',
    expectedTimeline: scope.expectedTimeline || '',
    commercialNotes: scope.commercialNotes || '',
  });
  const [followUpDraft, setFollowUpDraft] = useState({
    nextFollowUpAt: item.followUp?.nextFollowUpAt
      ? new Date(item.followUp.nextFollowUpAt).toISOString().slice(0, 16)
      : '',
    followUpOwnerId: item.followUpOwnerId || item.commercialOwnerId || '',
    followUpReason: item.followUp?.followUpReason || '',
  });

  const activeProposal = item.activeProposal;
  const isBusy = busy || localBusy;

  const ownerOptions = useMemo(
    () =>
      commercialOwners.map((o) => ({
        value: o.id,
        label: `${o.firstName} ${o.lastName} — ${o.systemRole}`,
      })),
    [commercialOwners],
  );

  async function run(fn: () => Promise<void>, success?: { title: string; description?: string }) {
    setLocalBusy(true);
    try {
      await fn();
      await onReload();
      if (success) {
        toast({ title: success.title, description: success.description });
      }
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Action failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setLocalBusy(false);
    }
  }

  useEffect(() => {
    if (!focusSection) return;

    const scrollToTarget = () => {
      const targetId =
        focusSection === 'proposal' ? 'triage-proposal-section' : 'triage-contact-section';
      const el = document.getElementById(targetId);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-xl');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-xl');
      }, 2500);
      if (focusSection === 'contact') setContactOpen(true);
      return true;
    };

    let cleared = false;
    const clearFocus = () => {
      if (cleared) return;
      cleared = true;
      onFocusHandled?.();
    };

    const timer = window.setTimeout(() => {
      if (scrollToTarget()) {
        clearFocus();
        return;
      }
      // Tab content may still be mounting — retry once.
      window.setTimeout(() => {
        scrollToTarget();
        clearFocus();
      }, 350);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [focusSection, onFocusHandled]);

  async function assignOwner(ownerId: string) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ commercialOwnerId: ownerId || '' }),
      });
    });
  }

  async function saveInterest(value: string) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ clientInterest: value }),
      });
    });
  }

  async function addContact() {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          contactMethod: contactDraft.contactMethod,
          outcome: contactDraft.outcome,
          notes: contactDraft.notes,
          nextFollowUpAt: contactDraft.nextFollowUpAt || null,
        }),
      });
      setContactOpen(false);
      setContactDraft({ contactMethod: 'CALL', outcome: 'INTERESTED', notes: '', nextFollowUpAt: '' });
    });
  }

  async function saveScope() {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}/scope`, {
        method: 'PATCH',
        body: JSON.stringify(scopeDraft),
      });
      setScopeOpen(false);
    });
  }

  async function saveFollowUp() {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nextFollowUpAt: followUpDraft.nextFollowUpAt || null,
          followUpOwnerId: followUpDraft.followUpOwnerId || null,
          followUpReason: followUpDraft.followUpReason || null,
        }),
      });
      setFollowUpOpen(false);
    });
  }

  async function createProposal() {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/proposals`, {
          method: 'POST',
          body: JSON.stringify({
            objectives: scopeDraft.clientObjectives,
            sitesOrBusinessUnits: scopeDraft.sitesOrBusinessUnits,
            scopeSummary: scopeDraft.indicativeScope,
            timeline: scopeDraft.expectedTimeline,
          }),
        });
      },
      { title: 'Proposal created', description: 'Draft proposal is ready to edit or send.' },
    );
  }

  async function proposalAction(action: string) {
    if (!activeProposal?.id) return;
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}/proposals/${activeProposal.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    });
  }

  async function uploadProposal(file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('title', `${item.organisationName} — Executive Advisory Diagnostic`);
    setLocalBusy(true);
    try {
      const res = await fetch(`/api/gw/triage/submissions/${submissionId}/proposals/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message =
          typeof err.message === 'string'
            ? err.message
            : Array.isArray(err.message)
              ? err.message.join(', ')
              : 'Upload failed.';
        throw new Error(message);
      }
      await onReload();
      toast({
        title: 'Proposal uploaded',
        description: `${file.name} was uploaded successfully.`,
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setLocalBusy(false);
    }
  }

  async function downloadProposal() {
    if (!activeProposal?.id) return;
    const data = await apiFetch<{ url: string }>(
      `/triage/submissions/${submissionId}/proposals/${activeProposal.id}/download`,
    );
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Lead ownership</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-3">
            <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commercial owner</dt>
              <dd>
                <FilterSelect
                  value={item.commercialOwnerId || ''}
                  onChange={(v) => void assignOwner(v)}
                  disabled={isBusy}
                  placeholder="Assign commercial owner"
                  triggerClassName="h-10 w-full max-w-sm"
                  options={ownerOptions}
                />
              </dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current stage</dt>
              <dd className="text-sm font-medium text-slate-900">
                {item.commercialStageLabel || '—'}
              </dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</dt>
              <dd className="text-sm text-slate-800">{item.source || '—'}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client interest</dt>
              <dd>
                <FilterSelect
                  value={item.clientInterest || 'UNKNOWN'}
                  onChange={(v) => void saveInterest(v)}
                  disabled={isBusy}
                  includeAll={false}
                  placeholder="Client interest"
                  triggerClassName="h-10 w-full max-w-sm"
                  options={INTEREST_OPTIONS}
                />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card id="triage-contact-section" className="rounded-xl border-slate-200 shadow-sm scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Contact history</CardTitle>
            <CardDescription>Newest first — append-only activity records</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={isBusy}
            onClick={() => setContactOpen((v) => !v)}
          >
            <Plus className="size-4" />
            Add contact activity
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {contactOpen ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterSelect
                  value={contactDraft.contactMethod}
                  onChange={(v) => setContactDraft((d) => ({ ...d, contactMethod: v }))}
                  options={CONTACT_METHODS}
                  includeAll={false}
                  placeholder="Method"
                  disabled={isBusy}
                  triggerClassName="h-10 w-full bg-white"
                />
                <FilterSelect
                  value={contactDraft.outcome}
                  onChange={(v) => setContactDraft((d) => ({ ...d, outcome: v }))}
                  options={CONTACT_OUTCOMES}
                  includeAll={false}
                  placeholder="Outcome"
                  disabled={isBusy}
                  triggerClassName="h-10 w-full bg-white"
                />
              </div>
              <Textarea
                rows={3}
                className="bg-white"
                placeholder="Notes from this contact…"
                value={contactDraft.notes}
                onChange={(e) => setContactDraft((d) => ({ ...d, notes: e.target.value }))}
                disabled={isBusy}
              />
              <div className="grid gap-2 sm:max-w-xs">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Next follow-up (optional)
                </label>
                <Input
                  type="datetime-local"
                  value={contactDraft.nextFollowUpAt}
                  onChange={(e) => setContactDraft((d) => ({ ...d, nextFollowUpAt: e.target.value }))}
                  disabled={isBusy}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setContactOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={isBusy} onClick={() => void addContact()}>
                  Save contact
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {(item.contactActivities || []).map((activity: any) => (
              <div key={activity.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="m-0 text-sm font-semibold text-slate-900">
                    {fmt(activity.contactedAt)} ·{' '}
                    {CONTACT_METHODS.find((m) => m.value === activity.contactMethod)?.label || activity.contactMethod}
                  </p>
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {CONTACT_OUTCOMES.find((o) => o.value === activity.outcome)?.label || activity.outcome}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{personName(activity.contactedBy)}</p>
                {activity.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{activity.notes}</p>
                ) : null}
                {activity.nextFollowUpAt ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Next follow-up: {fmt(activity.nextFollowUpAt)}
                  </p>
                ) : null}
              </div>
            ))}
            {!item.contactActivities?.length && !contactOpen ? (
              <p className="text-sm text-muted-foreground">No contact activity recorded yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Scope discussion</CardTitle>
            <CardDescription>Lightweight commercial scope — not the Level 2 diagnostic itself</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setScopeOpen((v) => !v)}>
            {scopeOpen ? 'Cancel' : 'Edit scope'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {scopeOpen ? (
            <div className="space-y-3">
              <Textarea
                rows={2}
                className="bg-white"
                placeholder="Client objectives"
                value={scopeDraft.clientObjectives}
                onChange={(e) => setScopeDraft((d) => ({ ...d, clientObjectives: e.target.value }))}
              />
              <Textarea
                rows={2}
                className="bg-white"
                placeholder="Sites / business units"
                value={scopeDraft.sitesOrBusinessUnits}
                onChange={(e) => setScopeDraft((d) => ({ ...d, sitesOrBusinessUnits: e.target.value }))}
              />
              <Textarea
                rows={2}
                className="bg-white"
                placeholder="Indicative scope"
                value={scopeDraft.indicativeScope}
                onChange={(e) => setScopeDraft((d) => ({ ...d, indicativeScope: e.target.value }))}
              />
              <Input
                placeholder="Expected timeline"
                value={scopeDraft.expectedTimeline}
                onChange={(e) => setScopeDraft((d) => ({ ...d, expectedTimeline: e.target.value }))}
              />
              <Textarea
                rows={2}
                className="bg-white"
                placeholder="Commercial notes"
                value={scopeDraft.commercialNotes}
                onChange={(e) => setScopeDraft((d) => ({ ...d, commercialNotes: e.target.value }))}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={isBusy} onClick={() => void saveScope()}>
                  Save scope
                </Button>
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Proposed product</dt>
                <dd className="text-slate-900">Executive Advisory Diagnostic</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Client objective</dt>
                <dd className="text-slate-800">{scope.clientObjectives || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Sites</dt>
                <dd className="text-slate-800">{scope.sitesOrBusinessUnits || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Indicative scope</dt>
                <dd className="whitespace-pre-wrap text-slate-800">{scope.indicativeScope || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Timeline</dt>
                <dd className="text-slate-800">{scope.expectedTimeline || '—'}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card id="triage-proposal-section" className="rounded-xl border-slate-200 shadow-sm scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Proposal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeProposal ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 text-sm font-semibold text-slate-900">
                  Proposal {activeProposal.proposalNumber}
                </p>
                <Badge variant="info" className="shrink-0 whitespace-nowrap">
                  {proposalStatusLabel(activeProposal.status)}
                </Badge>
              </div>
              <p className="m-0 text-sm text-slate-600">{activeProposal.title}</p>
              {activeProposal.sentAt ? (
                <p className="m-0 text-xs text-slate-500">Sent: {fmt(activeProposal.sentAt)}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {activeProposal.documentStorageKey ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void downloadProposal()}>
                    Download
                  </Button>
                ) : null}
                {['DRAFT', 'INTERNAL_REVIEW', 'APPROVED'].includes(activeProposal.status) ? (
                  <Button type="button" size="sm" disabled={isBusy} onClick={() => void proposalAction('SENT')}>
                    Mark sent
                  </Button>
                ) : null}
                {['SENT', 'VIEWED'].includes(activeProposal.status) ? (
                  <>
                    <Button type="button" size="sm" disabled={isBusy} onClick={() => void proposalAction('ACCEPTED')}>
                      Mark accepted
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void proposalAction('DECLINED')}
                    >
                      Mark declined
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No proposal yet.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={isBusy} onClick={() => void createProposal()}>
                  Create proposal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Upload proposal
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadProposal(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="text-base">Next follow-up</CardTitle>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setFollowUpOpen((v) => !v)}>
            {followUpOpen ? 'Cancel' : 'Schedule'}
          </Button>
        </CardHeader>
        <CardContent>
          {followUpOpen ? (
            <div className="space-y-3">
              <Input
                type="datetime-local"
                value={followUpDraft.nextFollowUpAt}
                onChange={(e) => setFollowUpDraft((d) => ({ ...d, nextFollowUpAt: e.target.value }))}
              />
              <FilterSelect
                value={followUpDraft.followUpOwnerId}
                onChange={(v) => setFollowUpDraft((d) => ({ ...d, followUpOwnerId: v }))}
                options={ownerOptions}
                placeholder="Follow-up owner"
                triggerClassName="h-10 w-full"
              />
              <Textarea
                rows={2}
                placeholder="Reason / agenda"
                value={followUpDraft.followUpReason}
                onChange={(e) => setFollowUpDraft((d) => ({ ...d, followUpReason: e.target.value }))}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={isBusy} onClick={() => void saveFollowUp()}>
                  Save follow-up
                </Button>
              </div>
            </div>
          ) : item.followUp?.nextFollowUpAt ? (
            <div className="text-sm">
              <p className="m-0 font-medium text-slate-900">{fmt(item.followUp.nextFollowUpAt)}</p>
              <p className="m-0 mt-1 text-slate-600">{personName(item.followUp.followUpOwner)}</p>
              {item.followUp.followUpReason ? (
                <p className="m-0 mt-2 text-slate-700">{item.followUp.followUpReason}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No follow-up scheduled.</p>
          )}
        </CardContent>
      </Card>

      {isBusy ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
