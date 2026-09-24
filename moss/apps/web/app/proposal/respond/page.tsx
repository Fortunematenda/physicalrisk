'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PublicProposal = {
  proposalNumber: string;
  title: string;
  subtitle?: string | null;
  organisationName: string;
  status: string;
  versionLabel: string;
  proposalDate: string;
  currency: string;
  paymentTerms?: string | null;
  feeTotals: {
    subtotal: number;
    discountedSubtotal: number;
    vatAmount: number;
    grandTotal: number;
    expenses: number;
    includeExpenses: boolean;
  };
  poRequirement: string;
  hasDocument: boolean;
  canRespond: boolean;
  alreadyAccepted: boolean;
  alreadyDeclined: boolean;
  acceptance?: {
    acceptedAt?: string | null;
    acceptedByName?: string | null;
    acceptedByEmail?: string | null;
    poNumber?: string | null;
  } | null;
};

type Mode = 'choose' | 'accept' | 'changes' | 'decline' | 'done';

function money(amount: number, currency = 'ZAR') {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency === 'R' ? 'ZAR' : currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-ZA')}`;
  }
}

function ProposalRespondInner() {
  const params = useSearchParams();
  const token = String(params.get('token') || '');
  const [data, setData] = useState<PublicProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');
  const [successMessage, setSuccessMessage] = useState('');

  const [acceptedByName, setAcceptedByName] = useState('');
  const [acceptedByJobTitle, setAcceptedByJobTitle] = useState('');
  const [acceptedByEmail, setAcceptedByEmail] = useState('');
  const [acceptedByPhone, setAcceptedByPhone] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [poRequiredChoice, setPoRequiredChoice] = useState<'YES' | 'NO' | 'NOT_YET'>('NO');
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [poValue, setPoValue] = useState('');
  const [procurementContact, setProcurementContact] = useState('');
  const [procurementEmail, setProcurementEmail] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const poRequiredWithAcceptance = useMemo(
    () => String(data?.poRequirement || '').toUpperCase() === 'REQUIRED_WITH_ACCEPTANCE',
    [data?.poRequirement],
  );

  async function load() {
    setLoading(true);
    setError('');
    if (!token) {
      setError('This proposal link is invalid or has expired.');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/public/proposal/respond?token=${encodeURIComponent(token)}`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'This proposal link is invalid or has expired.');
      setData(json);
      if (json.alreadyAccepted || json.alreadyDeclined || !json.canRespond) setMode('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This proposal link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitAccept() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/public/proposal/respond/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          acceptedByName,
          acceptedByEmail,
          acceptedByJobTitle,
          acceptedByPhone,
          authorised,
          poRequiredChoice: poRequiredWithAcceptance ? 'YES' : poRequiredChoice,
          poNumber: poNumber || undefined,
          poDate: poDate || undefined,
          poValue: poValue || undefined,
          procurementContact: procurementContact || undefined,
          procurementEmail: procurementEmail || undefined,
          poNotes: poNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Unable to accept this proposal.');
      setData(json);
      setSuccessMessage('Proposal accepted. Thank you — Physical Risk will be in touch regarding next steps.');
      setMode('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to accept this proposal.');
    } finally {
      setBusy(false);
    }
  }

  async function submitChanges() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/public/proposal/respond/changes`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          notes: changeNotes,
          contactName: acceptedByName || undefined,
          contactEmail: acceptedByEmail || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Unable to submit change request.');
      setData(json);
      setSuccessMessage('Your change request has been sent to Physical Risk.');
      setMode('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit change request.');
    } finally {
      setBusy(false);
    }
  }

  async function submitDecline() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/public/proposal/respond/decline`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          reason: declineReason,
          contactName: acceptedByName || undefined,
          contactEmail: acceptedByEmail || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Unable to decline this proposal.');
      setData(json);
      setSuccessMessage('Proposal declined. Thank you for letting us know.');
      setMode('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to decline this proposal.');
    } finally {
      setBusy(false);
    }
  }

  const pdfHref = token
    ? `${API_BASE}/public/proposal/respond/pdf?token=${encodeURIComponent(token)}`
    : '#';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="m-0 text-lg font-bold tracking-tight text-slate-900">physicalrisk</p>
            <p className="m-0 text-xs uppercase tracking-wide text-slate-500">security matters</p>
          </div>
          <p className="m-0 text-sm text-slate-500">Proposal response</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {loading ? <p className="text-slate-600">Loading proposal…</p> : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {data ? (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{data.proposalNumber}</h1>
              <p className="m-0 mt-1 text-slate-600">{data.organisationName}</p>
              <p className="m-0 mt-3 font-medium text-slate-900">{data.title}</p>
              {data.subtitle ? <p className="m-0 text-sm text-slate-500">{data.subtitle}</p> : null}
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Version</dt>
                  <dd className="font-medium">{data.versionLabel}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-medium">{data.status.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Professional fees</dt>
                  <dd className="font-medium">{money(data.feeTotals.discountedSubtotal, data.currency)}</dd>
                </div>
                {data.feeTotals.includeExpenses ? (
                  <div>
                    <dt className="text-slate-500">Estimated expenses</dt>
                    <dd className="font-medium">{money(data.feeTotals.expenses, data.currency)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-500">VAT</dt>
                  <dd className="font-medium">{money(data.feeTotals.vatAmount, data.currency)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Grand total</dt>
                  <dd className="font-semibold">{money(data.feeTotals.grandTotal, data.currency)}</dd>
                </div>
              </dl>
              {data.paymentTerms ? (
                <p className="mt-4 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Payment terms: </span>
                  {data.paymentTerms}
                </p>
              ) : null}
              {data.hasDocument ? (
                <div className="mt-4">
                  <Button asChild variant="outline">
                    <a href={pdfHref} target="_blank" rel="noreferrer">
                      View / Download proposal
                    </a>
                  </Button>
                </div>
              ) : null}
            </section>

            {mode === 'done' || data.alreadyAccepted || data.alreadyDeclined ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5">
                <h2 className="m-0 text-lg font-semibold text-emerald-950">
                  {data.alreadyAccepted
                    ? 'Proposal accepted'
                    : data.alreadyDeclined
                      ? 'Proposal declined'
                      : 'Response recorded'}
                </h2>
                {successMessage ? <p className="mt-2 text-sm text-emerald-900">{successMessage}</p> : null}
                {data.acceptance ? (
                  <dl className="mt-3 grid gap-1 text-sm text-emerald-950 sm:grid-cols-2">
                    <div>
                      <dt className="text-emerald-800">Reference</dt>
                      <dd className="font-medium">{data.proposalNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-emerald-800">Accepted by</dt>
                      <dd className="font-medium">{data.acceptance.acceptedByName || '—'}</dd>
                    </div>
                    {data.acceptance.poNumber ? (
                      <div>
                        <dt className="text-emerald-800">PO</dt>
                        <dd className="font-medium">{data.acceptance.poNumber}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </section>
            ) : null}

            {mode === 'choose' && data.canRespond ? (
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-lg font-semibold">Proposal response</h2>
                <p className="m-0 text-sm text-slate-600">
                  Choose how you would like to respond. You do not need a MOSS account.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" onClick={() => setMode('accept')}>
                    Accept proposal
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setMode('changes')}>
                    Request changes
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setMode('decline')}>
                    Decline proposal
                  </Button>
                </div>
              </section>
            ) : null}

            {mode === 'accept' ? (
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-lg font-semibold">Accept proposal</h2>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="m-0 font-semibold text-slate-900">Acceptance summary</p>
                  <p className="mt-2 m-0">By accepting this proposal, you confirm:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>the scope and deliverables</li>
                    <li>the professional fees and applicable expenses</li>
                    <li>payment terms, assumptions and exclusions</li>
                    <li>the applicable Terms &amp; Conditions / engagement terms</li>
                    <li>that you are authorised to accept on behalf of the organisation</li>
                  </ul>
                  <p className="mt-2 m-0">
                    Review the full proposal PDF before confirming.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="name">Authorised person full name *</Label>
                    <Input id="name" value={acceptedByName} onChange={(e) => setAcceptedByName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Job title / position</Label>
                    <Input id="title" value={acceptedByJobTitle} onChange={(e) => setAcceptedByJobTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Telephone (optional)</Label>
                    <Input id="phone" value={acceptedByPhone} onChange={(e) => setAcceptedByPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="email">Email address *</Label>
                    <Input id="email" type="email" value={acceptedByEmail} onChange={(e) => setAcceptedByEmail(e.target.value)} />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={authorised}
                    onChange={(e) => setAuthorised(e.target.checked)}
                  />
                  <span>
                    I confirm that I am authorised to accept this proposal on behalf of the organisation and agree to
                    the proposal terms, scope, fees, assumptions and conditions.
                  </span>
                </label>

                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <p className="m-0 font-semibold">Purchase Order / procurement details</p>
                  {!poRequiredWithAcceptance ? (
                    <div className="space-y-2 text-sm">
                      <p className="m-0 text-slate-600">Does your organisation require a Purchase Order?</p>
                      {(['NO', 'YES', 'NOT_YET'] as const).map((opt) => (
                        <label key={opt} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="poChoice"
                            checked={poRequiredChoice === opt}
                            onChange={() => setPoRequiredChoice(opt)}
                          />
                          {opt === 'YES' ? 'Yes' : opt === 'NO' ? 'No' : 'Not yet available'}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0 text-sm text-amber-800">
                      A Purchase Order number is required with acceptance for this proposal.
                    </p>
                  )}
                  {(poRequiredWithAcceptance || poRequiredChoice === 'YES') && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="poNumber">PO Number *</Label>
                        <Input id="poNumber" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="poDate">PO Date</Label>
                        <Input id="poDate" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="poValue">PO Value</Label>
                        <Input id="poValue" type="number" value={poValue} onChange={(e) => setPoValue(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="procContact">Procurement contact</Label>
                        <Input
                          id="procContact"
                          value={procurementContact}
                          onChange={(e) => setProcurementContact(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="procEmail">Procurement email</Label>
                        <Input
                          id="procEmail"
                          type="email"
                          value={procurementEmail}
                          onChange={(e) => setProcurementEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="poNotes">Additional PO / procurement notes</Label>
                        <textarea
                          id="poNotes"
                          className="min-h-[80px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          value={poNotes}
                          onChange={(e) => setPoNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void submitAccept()}>
                    {busy ? 'Submitting…' : 'Accept proposal'}
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('choose')}>
                    Back
                  </Button>
                </div>
              </section>
            ) : null}

            {mode === 'changes' ? (
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-lg font-semibold">Request changes</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="changes">Reason / requested change *</Label>
                  <textarea
                    id="changes"
                    className="min-h-[120px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void submitChanges()}>
                    {busy ? 'Submitting…' : 'Submit change request'}
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('choose')}>
                    Back
                  </Button>
                </div>
              </section>
            ) : null}

            {mode === 'decline' ? (
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="m-0 text-lg font-semibold">Decline proposal</h2>
                <div className="space-y-1.5">
                  <Label htmlFor="decline">Reason / comments *</Label>
                  <textarea
                    id="decline"
                    className="min-h-[120px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void submitDecline()}>
                    {busy ? 'Submitting…' : 'Decline proposal'}
                  </Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('choose')}>
                    Back
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

export default function ProposalRespondPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-600">Loading…</div>}>
      <ProposalRespondInner />
    </Suspense>
  );
}
