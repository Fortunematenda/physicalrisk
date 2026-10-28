'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FilterX, History, RefreshCw, SearchX } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FilterBar } from '@/components/common/filter-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api';
import { safeExternalNavUrl } from '@/lib/navigation';
import {
  ATTEMPT_COPY,
  EMPTY_HISTORY_FILTERS,
  HISTORY_COPY,
  HISTORY_PAGE_SIZES,
  HISTORY_RECORD_TYPE_OPTIONS,
  HISTORY_STATUS_OPTIONS,
  TONE_CLASSES,
  formatDateTime,
  formatDateTimeFull,
  hasActiveFilters,
  historyQuery,
  isJobInFlight,
  triggerLabel,
  type CrmHistoryFilters,
  type CrmHistoryItem,
  type CrmHistoryPage,
  type CrmSyncJobDetail,
  type Tone,
} from '@/lib/crm-integration';

export type HistoryFeedback = { kind: 'success' | 'error'; title: string; detail?: string };

const SELECT_CLASS =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const POLL_INTERVAL_MS = 4000;
/** Stop watching a retried job after this long; the row can still be refreshed by reloading. */
const POLL_LIMIT_MS = 3 * 60_000;
const SEARCH_DEBOUNCE_MS = 350;

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

function Timestamp({ iso, fallback }: { iso: string | null | undefined; fallback?: string }) {
  if (!iso) return <span className="text-slate-500">{fallback ?? 'Not recorded'}</span>;
  return (
    <time dateTime={iso} title={formatDateTimeFull(iso)} className="whitespace-nowrap">
      {formatDateTime(iso)}
    </time>
  );
}

function CrmLink({ url, label }: { url: string | null; label: string }) {
  const safe = safeExternalNavUrl(url);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#c41230] hover:underline"
      aria-label={`${label} (opens in a new tab)`}
    >
      View in EspoCRM <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function errorText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

type DetailState = { loading: boolean; error: string; data: CrmSyncJobDetail | null };

function JobDetails({ state, onReload }: { state: DetailState | undefined; onReload: () => void }) {
  if (!state || (state.loading && !state.data)) {
    return <p className="text-sm text-slate-600" role="status">Loading attempt history…</p>;
  }
  if (state.error && !state.data) {
    return <ErrorState message={state.error} onRetry={onReload} />;
  }
  const detail = state.data!;
  const { job } = detail;
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Job created</dt>
          <dd>{formatDateTimeFull(job.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Latest activity</dt>
          <dd>{formatDateTimeFull(job.lastActivityAt)}</dd>
        </div>
        {job.nextRetryAt ? (
          <div>
            <dt className="text-slate-500">Next automatic retry</dt>
            <dd>{formatDateTimeFull(job.nextRetryAt)}</dd>
          </div>
        ) : null}
        {job.crmUrl ? (
          <div>
            <dt className="text-slate-500">CRM record</dt>
            <dd><CrmLink url={job.crmUrl} label={`View ${job.recordType} ${job.reference} in EspoCRM`} /></dd>
          </div>
        ) : null}
      </dl>

      {job.legacy ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700">
          Recorded before sync jobs were tracked. This entry may be a separate job or a repeat of another one; MOSS
          cannot tell which, so it is shown on its own.
        </p>
      ) : null}
      {job.supersededAt ? (
        <p className="text-slate-700">
          A newer sync of this record was started {formatDateTime(job.supersededAt)}. This job&apos;s own status is unchanged.
        </p>
      ) : null}
      {job.retryNote ? <p className="text-slate-700">{job.retryNote}</p> : null}

      <div>
        <h4 className="mb-2 font-semibold text-slate-900">Attempts</h4>
        {detail.attempts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Attempts for {job.recordType} {job.reference}</caption>
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-1.5 pr-3">#</th>
                  <th scope="col" className="py-1.5 pr-3">Trigger</th>
                  <th scope="col" className="py-1.5 pr-3">Started</th>
                  <th scope="col" className="py-1.5 pr-3">Completed</th>
                  <th scope="col" className="py-1.5 pr-3">Outcome</th>
                  <th scope="col" className="py-1.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.attempts.map((a) => {
                  const copy = a.outcome ? ATTEMPT_COPY[a.outcome] : null;
                  return (
                    <tr key={a.attemptNumber}>
                      <td className="py-1.5 pr-3 tabular-nums">{a.attemptNumber}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{triggerLabel(a.trigger)}</td>
                      <td className="py-1.5 pr-3"><Timestamp iso={a.startedAt} /></td>
                      <td className="py-1.5 pr-3"><Timestamp iso={a.completedAt} fallback={a.outcome === 'running' ? 'In progress' : 'Not recorded'} /></td>
                      <td className="py-1.5 pr-3">
                        {copy ? <StatusPill tone={copy.tone}>{copy.label}</StatusPill> : <span className="text-slate-500">Not recorded</span>}
                      </td>
                      <td className="py-1.5">
                        {a.errorSummary ? <span className="text-red-800">{a.errorSummary}</span> : null}
                        {a.crmUrl ? <CrmLink url={a.crmUrl} label={`View ${job.recordType} from attempt ${a.attemptNumber} in EspoCRM`} /> : null}
                        {!a.errorSummary && !a.crmUrl ? <span className="text-slate-500">—</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-600">No attempts are recorded individually for this job.</p>
        )}
        {detail.unrecordedAttempts > 0 ? (
          <p className="mt-2 text-slate-600">
            {detail.unrecordedAttempts === 1 ? '1 earlier attempt was' : `${detail.unrecordedAttempts} earlier attempts were`} made
            before attempts were recorded individually, so their times and errors are not available.
          </p>
        ) : null}
      </div>

      {detail.records.length ? (
        <div>
          <h4 className="mb-2 font-semibold text-slate-900">CRM records written by this job</h4>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {detail.records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-medium text-slate-900">{r.recordType}</span>
                {r.action ? <span className="text-slate-500">{r.action}</span> : null}
                <StatusPill tone={HISTORY_COPY[r.status].tone}>{HISTORY_COPY[r.status].label}</StatusPill>
                <Timestamp iso={r.at} />
                {r.errorSummary ? <span className="text-red-800">{r.errorSummary}</span> : null}
                <CrmLink url={r.crmUrl} label={`View ${r.recordType} in EspoCRM`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  onFeedback: (feedback: HistoryFeedback | null) => void;
  /** Called after a retried job settles, so summary cards can reload. */
  onJobSettled: () => void;
};

export function CrmSyncHistory({ onFeedback, onJobSettled }: Props) {
  const [filters, setFilters] = useState<CrmHistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(HISTORY_PAGE_SIZES[0]);
  const [data, setData] = useState<CrmHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, DetailState>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const watched = useRef(new Map<string, number>());
  const [watchTick, setWatchTick] = useState(0);

  const dateError =
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
      ? 'The start date must be on or before the end date.'
      : '';

  const load = useCallback(async () => {
    if (dateError) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<CrmHistoryPage>(`/integrations/espocrm/history?${historyQuery(filters, page, pageSize)}`);
      if (result.total > 0 && result.items.length === 0 && page > result.totalPages) {
        setPage(result.totalPages);
        return;
      }
      setData(result);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError && e.status === 403) setHidden(true);
      else setError(errorText(e, 'Sync history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, dateError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((f) => (f.search === searchDraft.trim() ? f : { ...f, search: searchDraft.trim() }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  const updateFilter = (key: keyof CrmHistoryFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_HISTORY_FILTERS);
    setSearchDraft('');
    setPage(1);
  };

  const replaceRow = (job: CrmHistoryItem) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === job.id ? job : i)) } : d));

  const loadDetail = useCallback(async (id: string) => {
    setDetails((d) => ({ ...d, [id]: { loading: true, error: '', data: d[id]?.data ?? null } }));
    try {
      const detail = await apiFetch<CrmSyncJobDetail>(`/integrations/espocrm/history/${encodeURIComponent(id)}`);
      setDetails((d) => ({ ...d, [id]: { loading: false, error: '', data: detail } }));
      return detail;
    } catch (e) {
      setDetails((d) => ({ ...d, [id]: { loading: false, error: errorText(e, 'Attempt history could not be loaded.'), data: d[id]?.data ?? null } }));
      return null;
    }
  }, []);

  const toggle = (id: string) => {
    const opening = !expanded.has(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (opening) next.add(id);
      else next.delete(id);
      return next;
    });
    if (opening) void loadDetail(id);
  };

  // Follow retried jobs until the server reports a settled status.
  useEffect(() => {
    if (!watched.current.size) return;
    const handle = window.setTimeout(async () => {
      for (const [id, startedAt] of [...watched.current]) {
        const detail = await loadDetail(id);
        if (!detail) continue;
        replaceRow(detail.job);
        if (!isJobInFlight(detail.job.status)) {
          watched.current.delete(id);
          const copy = HISTORY_COPY[detail.job.status];
          onFeedback(
            detail.job.status === 'success'
              ? { kind: 'success', title: 'Retry succeeded.', detail: `${detail.job.recordType} ${detail.job.reference} was sent to EspoCRM.` }
              : { kind: 'error', title: `Retry finished: ${copy.label}.`, detail: detail.job.errorSummary ?? 'Open Details for the attempt history.' },
          );
          onJobSettled();
        } else if (Date.now() - startedAt > POLL_LIMIT_MS) {
          watched.current.delete(id);
        }
      }
      setWatchTick((t) => t + 1);
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(handle);
  }, [watchTick, loadDetail, onFeedback, onJobSettled]);

  async function retry(item: CrmHistoryItem) {
    setSubmitting(item.id);
    onFeedback(null);
    try {
      const job = await apiFetch<CrmHistoryItem>(`/integrations/espocrm/retry/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        body: '{}',
      });
      replaceRow(job);
      onFeedback({
        kind: 'success',
        title: 'Retry queued',
        detail: `${job.recordType} ${job.reference} is ${HISTORY_COPY[job.status].label.toLowerCase()}. This row updates when the attempt finishes.`,
      });
      if (expanded.has(job.id)) void loadDetail(job.id);
      if (isJobInFlight(job.status)) {
        watched.current.set(job.id, Date.now());
        setWatchTick((t) => t + 1);
      } else {
        onJobSettled();
      }
    } catch (e) {
      onFeedback({ kind: 'error', title: 'Retry not started', detail: errorText(e, 'The retry could not be started.') });
      void load();
    } finally {
      setSubmitting(null);
    }
  }

  if (hidden) return null;

  const filtered = hasActiveFilters(filters);
  const items = data?.items ?? [];
  const showTable = items.length > 0;

  return (
    <section className="dash2-card mb-6 min-w-0" aria-labelledby="crm-history-heading">
      <div className="dash2-card-head flex-wrap gap-3">
        <div>
          <h2 id="crm-history-heading" className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" /> Sync history
          </h2>
          <p>One row per sync job, latest activity first. Times are shown in SAST.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <FilterBar
        className="mb-4"
        clearAction={
          filtered || searchDraft ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              <FilterX aria-hidden="true" />
              Clear filters
            </Button>
          ) : undefined
        }
      >
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="crm-history-status" className="whitespace-nowrap">Status</Label>
          <select id="crm-history-status" className={SELECT_CLASS} value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
            {HISTORY_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="crm-history-type" className="whitespace-nowrap">Record type</Label>
          <select id="crm-history-type" className={SELECT_CLASS} value={filters.recordType} onChange={(e) => updateFilter('recordType', e.target.value)}>
            {HISTORY_RECORD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="crm-history-from" className="whitespace-nowrap">From (SAST)</Label>
          <Input
            id="crm-history-from"
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(e) => updateFilter('dateFrom', e.target.value)}
            aria-describedby={dateError ? 'crm-history-date-error' : undefined}
            aria-invalid={dateError ? true : undefined}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="crm-history-to" className="whitespace-nowrap">To (SAST)</Label>
          <Input
            id="crm-history-to"
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(e) => updateFilter('dateTo', e.target.value)}
            aria-describedby={dateError ? 'crm-history-date-error' : undefined}
            aria-invalid={dateError ? true : undefined}
          />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="crm-history-search" className="whitespace-nowrap">Reference</Label>
          <Input
            id="crm-history-search"
            type="search"
            value={searchDraft}
            maxLength={100}
            placeholder="Assessment reference, organisation or record ID"
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </div>
      </FilterBar>
      {dateError ? <p id="crm-history-date-error" className="error mb-3" role="alert">{dateError}</p> : null}

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !showTable && loading ? (
        <p className="py-6 text-center text-sm text-slate-600" role="status">Loading sync history…</p>
      ) : !showTable ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No jobs match these filters"
            description="Change or clear the filters to see more sync jobs."
            action={<Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState icon={History} title="No sync jobs recorded" description="Jobs appear here once MOSS sends records to EspoCRM." />
        )
      ) : (
        <>
          <div className="w-full max-w-full overflow-x-auto" role="region" aria-label="Sync history table" tabIndex={0}>
            <table className="w-full min-w-[920px] text-left text-sm" aria-busy={loading}>
              <caption className="sr-only">EspoCRM sync jobs. Use Details to see each job&apos;s attempts.</caption>
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="whitespace-nowrap py-2 pr-3">Last attempt</th>
                  <th scope="col" className="whitespace-nowrap py-2 pr-3">Record type</th>
                  <th scope="col" className="py-2 pr-3">Reference</th>
                  <th scope="col" className="whitespace-nowrap py-2 pr-3">Current status</th>
                  <th scope="col" className="py-2 pr-3 text-right">Attempts</th>
                  <th scope="col" className="py-2 pr-3">Result</th>
                  <th scope="col" className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const copy = HISTORY_COPY[item.status];
                  const open = expanded.has(item.id);
                  const detailsId = `crm-job-${item.id}-details`;
                  const busy = submitting === item.id || isJobInFlight(item.status);
                  return (
                    <Fragment key={item.id}>
                      <tr className={`border-t border-slate-100 align-top ${open ? 'bg-slate-50' : ''}`}>
                        <td className="py-2 pr-3">
                          {item.lastAttemptAt ? (
                            <Timestamp iso={item.lastAttemptAt} />
                          ) : (
                            <span className="text-slate-500">
                              Queued <Timestamp iso={item.createdAt} />
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{item.recordType}</td>
                        <td className="py-2 pr-3">
                          <span className="break-words">{item.reference}</span>
                          {item.legacy ? (
                            <span className="ml-2 inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-600" title="Recorded before sync jobs were tracked">
                              Legacy
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          <StatusPill tone={copy.tone}>{copy.label}</StatusPill>
                          {item.nextRetryAt ? (
                            <span className="mt-1 block whitespace-nowrap text-xs text-slate-500">
                              Next retry <Timestamp iso={item.nextRetryAt} />
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{item.attempts}</td>
                        <td className="max-w-xs py-2 pr-3 text-slate-700">
                          {item.status === 'success' ? (
                            item.crmUrl ? (
                              <CrmLink url={item.crmUrl} label={`View ${item.recordType} ${item.reference} in EspoCRM`} />
                            ) : (
                              <span>Sent to EspoCRM</span>
                            )
                          ) : item.errorSummary ? (
                            <span className="line-clamp-2 text-red-800" title={item.errorSummary}>{item.errorSummary}</span>
                          ) : isJobInFlight(item.status) ? (
                            <span>In progress</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                          {item.supersededAt ? (
                            <span className="mt-1 block text-xs text-slate-500">A newer sync of this record exists.</span>
                          ) : null}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggle(item.id)}
                              aria-expanded={open}
                              aria-controls={detailsId}
                              aria-label={`${open ? 'Hide' : 'Show'} details for ${item.recordType} ${item.reference}`}
                            >
                              {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                              Details
                            </Button>
                            {item.canRetry || submitting === item.id ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void retry(item)}
                                disabled={busy || submitting !== null}
                                aria-busy={submitting === item.id}
                                aria-label={`Retry ${item.recordType} ${item.reference}`}
                              >
                                <RefreshCw className={submitting === item.id ? 'animate-spin' : ''} aria-hidden="true" />
                                {submitting === item.id ? 'Queuing…' : 'Retry'}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr id={detailsId} className="bg-slate-50">
                          <td colSpan={7} className="border-t border-slate-100 px-3 pb-4 pt-2">
                            <JobDetails state={details[item.id]} onReload={() => void loadDetail(item.id)} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && data.total > 0 && !error ? (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Sync history pages">
          <p className="text-sm text-slate-600" aria-live="polite">
            Showing {data.rangeStart}–{data.rangeEnd} of {data.total} {data.total === 1 ? 'job' : 'jobs'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="crm-history-page-size" className="whitespace-nowrap text-sm font-normal text-slate-600">Jobs per page</Label>
            <select
              id="crm-history-page-size"
              className={`${SELECT_CLASS} w-auto`}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {HISTORY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || data.page <= 1}>
              Previous
            </Button>
            <span className="whitespace-nowrap text-sm text-slate-600">Page {data.page} of {data.totalPages}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={loading || data.page >= data.totalPages}>
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
