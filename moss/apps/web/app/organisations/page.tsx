'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { RowActionsMenu } from '../../components/RowActionsMenu';
import {
  IconDownload,
  IconMoreVertical,
  IconPlus,
  IconRotateCcw,
  IconSearch,
} from '../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../lib/api';
import { getStoredUser, resolveMvpNavRole } from '../../lib/auth-user';

type OrgForm = {
  name: string;
  industry: string;
  primaryEmail: string;
  primaryPhone: string;
  website: string;
  registrationNo: string;
};

type Organisation = {
  id: string;
  name: string;
  industry?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  website?: string | null;
  registrationNo?: string | null;
  espocrmAccountId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { assessments?: number; memberships?: number };
  submissionSummary?: {
    total: number;
    submitted: number;
    inProgress: number;
    completed: number;
  };
  latestAssessment?: {
    id: string;
    reference: string;
    status: string;
    updatedAt: string;
    scoreSnapshots?: Array<{ overallRiskScore: number | string; riskBand: string }>;
  } | null;
};

const emptyForm: OrgForm = {
  name: '',
  industry: '',
  primaryEmail: '',
  primaryPhone: '',
  website: '',
  registrationNo: '',
};

const PAGE_SIZE_OPTIONS = [8, 10, 20, 50];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'OR';
}

function shortId(id: string) {
  return `ORG-${id.slice(-5).toUpperCase()}`;
}

function riskTone(band?: string) {
  const value = (band || '').toLowerCase();
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'moderate') return 'moderate';
  if (value === 'low' || value === 'controlled') return 'low';
  return 'none';
}

export default function OrganisationsPage() {
  const [items, setItems] = useState<Organisation[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrgForm>(emptyForm);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  const load = () =>
    apiFetch<Organisation[]>('/organisations')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const industries = useMemo(() => {
    return [...new Set(items.map((x) => x.industry).filter(Boolean) as string[])].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return items.filter((org) => {
      if (q) {
        const hay = [
          org.name,
          org.industry,
          org.primaryEmail,
          org.primaryPhone,
          org.website,
          org.registrationNo,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (industryFilter && org.industry !== industryFilter) return false;

      const summary = org.submissionSummary || { total: 0, inProgress: 0, completed: 0, submitted: 0 };
      const isActive = summary.total > 0 || Boolean(org.primaryEmail);
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;

      if (assessmentFilter === 'in_progress' && summary.inProgress === 0) return false;
      if (assessmentFilter === 'completed' && summary.completed === 0) return false;
      if (assessmentFilter === 'none' && summary.total > 0) return false;

      const band = org.latestAssessment?.scoreSnapshots?.[0]?.riskBand || '';
      if (riskFilter && band !== riskFilter && !(riskFilter === 'Low' && ['Low', 'Controlled'].includes(band))) {
        return false;
      }
      return true;
    });
  }, [items, query, headerSearch, industryFilter, statusFilter, assessmentFilter, riskFilter]);

  const summary = useMemo(() => {
    let inProgress = 0;
    let approved = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let active = 0;
    for (const org of items) {
      const s = org.submissionSummary || { total: 0, inProgress: 0, completed: 0, submitted: 0 };
      inProgress += s.inProgress;
      approved += s.completed;
      if (s.total > 0 || org.primaryEmail) active += 1;
      const score = Number(org.latestAssessment?.scoreSnapshots?.[0]?.overallRiskScore);
      if (!Number.isNaN(score) && org.latestAssessment?.scoreSnapshots?.[0]) {
        scoreSum += score;
        scoreCount += 1;
      }
    }
    return {
      total: items.length,
      active,
      inProgress,
      approved,
      avgScore: scoreCount ? Math.round(scoreSum / scoreCount) : 0,
    };
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, industryFilter, statusFilter, assessmentFilter, riskFilter, pageSize]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/organisations/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/organisations', { method: 'POST', body: JSON.stringify(form) });
      }
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setLoading(true);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : editingId ? 'Unable to update organisation.' : 'Unable to create organisation.');
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    if (open && !editingId) {
      setOpen(false);
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(org: Organisation) {
    setEditingId(org.id);
    setForm({
      name: org.name || '',
      industry: org.industry || '',
      primaryEmail: org.primaryEmail || '',
      primaryPhone: org.primaryPhone || '',
      website: org.website || '',
      registrationNo: org.registrationNo || '',
    });
    setOpen(true);
    setMenuOpenId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteOrganisation(org: Organisation) {
    const count = org._count?.assessments ?? 0;
    const ok = window.confirm(
      count > 0
        ? `Delete “${org.name}” and its ${count} related assessment(s)? This cannot be undone.`
        : `Delete “${org.name}”? This cannot be undone.`,
    );
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(org.id);
    setError('');
    try {
      await apiFetch(`/organisations/${org.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== org.id));
      if (editingId === org.id) {
        setEditingId(null);
        setForm(emptyForm);
        setOpen(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete organisation.');
    } finally {
      setBusyId(null);
    }
  }

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setIndustryFilter('');
    setStatusFilter('');
    setAssessmentFilter('');
    setRiskFilter('');
  }

  function exportCsv() {
    const rows = [
      ['Name', 'Industry', 'Email', 'Phone', 'Assessments', 'In Progress', 'Completed', 'Latest Reference', 'SCLI Score', 'Risk Band'],
      ...filtered.map((org) => {
        const snap = org.latestAssessment?.scoreSnapshots?.[0];
        const s = org.submissionSummary || { total: 0, inProgress: 0, completed: 0 };
        return [
          org.name,
          org.industry || '',
          org.primaryEmail || '',
          org.primaryPhone || '',
          String(s.total),
          String(s.inProgress),
          String(s.completed),
          org.latestAssessment?.reference || '',
          snap ? String(Number(snap.overallRiskScore).toFixed(1)) : '',
          snap?.riskBand || '',
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-organisations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGate>
      <Shell
        title="Organisations"
        hideEyebrow
        subtitle="Manage all client organisations and their assessment activity."
        searchPlaceholder="Search organisations…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn org2-add-btn" onClick={startCreate}>
            <IconPlus />
            {open && !editingId ? 'Close form' : 'Add Organisation'}
          </button>
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={Building2}
            title="Total Organisations"
            value={summary.total}
            description="Portfolio size"
            tone="red"
            loading={loading}
          />
          <StatCard
            icon={Users}
            title="Active Organisations"
            value={summary.active}
            description="With contact or assessments"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={ClipboardList}
            title="Assessments In Progress"
            value={summary.inProgress}
            description="Across organisations"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={ShieldCheck}
            title="Approved Assessments"
            value={summary.approved}
            description="Completed / issued"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={TrendingUp}
            title="Avg. SCLI Score"
            value={summary.avgScore}
            description="Latest scored assessments"
            tone="amber"
            loading={loading}
          />
        </div>

        {open && (
          <form className="dash2-card org2-create-card" onSubmit={submit}>
            <div className="dash2-card-head">
              <div>
                <h2>{editingId ? 'Edit organisation' : 'New organisation'}</h2>
                <p>{editingId ? 'Update client details used across assessments and CRM' : 'Create a client record for assessments and CRM follow-up'}</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Industry</label>
                <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} list="org-industries" />
                <datalist id="org-industries">
                  {industries.map((industry) => <option key={industry} value={industry} />)}
                </datalist>
              </div>
              <div className="field">
                <label>Registration no.</label>
                <input value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} />
              </div>
              <div className="field">
                <label>Website</label>
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="field">
                <label>Primary email</label>
                <input type="email" value={form.primaryEmail} onChange={(e) => setForm({ ...form, primaryEmail: e.target.value })} />
              </div>
              <div className="field">
                <label>Primary phone</label>
                <input value={form.primaryPhone} onChange={(e) => setForm({ ...form, primaryPhone: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button className="btn" disabled={saving}>
                {saving ? (editingId ? 'Saving…' : 'Creating…') : (editingId ? 'Save changes' : 'Create organisation')}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={saving}
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <section className="dash2-card org2-filters-card">
          <div className="org2-filters">
            <label className="org2-filter-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by organisation name, industry…"
                aria-label="Filter organisations"
              />
            </label>
            <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} aria-label="Industry">
              <option value="">Industry</option>
              {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={assessmentFilter} onChange={(e) => setAssessmentFilter(e.target.value)} aria-label="Assessment status">
              <option value="">Assessment Status</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="none">No assessments</option>
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Risk rating">
              <option value="">Risk Rating</option>
              {['Critical', 'High', 'Moderate', 'Low'].map((band) => <option key={band} value={band}>{band}</option>)}
            </select>
            <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
              <IconRotateCcw />
              Clear Filters
            </button>
          </div>
        </section>

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="org2-table">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Industry</th>
                  <th>Primary Contact</th>
                  <th>Assessments</th>
                  <th>Latest Assessment</th>
                  <th>SCLI Score Latest</th>
                  <th>Risk Rating</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((org) => {
                  const summaryRow = org.submissionSummary || { total: 0, inProgress: 0, completed: 0, submitted: 0 };
                  const latest = org.latestAssessment;
                  const snap = latest?.scoreSnapshots?.[0];
                  const score = snap ? Number(snap.overallRiskScore) : null;
                  const band = snap?.riskBand;
                  const active = summaryRow.total > 0 || Boolean(org.primaryEmail);
                  return (
                    <tr key={org.id}>
                      <td>
                        <div className="org2-name-cell">
                          <span className="org2-avatar">{initials(org.name)}</span>
                          <div>
                            <Link href={`/organisations/${org.id}`}><strong>{org.name}</strong></Link>
                            <span className="muted small">{shortId(org.id)}</span>
                          </div>
                        </div>
                      </td>
                      <td>{org.industry || '—'}</td>
                      <td>
                        <div className="org2-contact">
                          <strong>{org.primaryEmail ? org.primaryEmail.split('@')[0].replace(/[._]/g, ' ') : '—'}</strong>
                          <span>{org.primaryEmail || 'No email'}</span>
                          <span>{org.primaryPhone || 'No phone'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="org2-assess-counts">
                          <span><em>Total</em><strong>{summaryRow.total}</strong></span>
                          <span><em>In Progress</em><strong>{summaryRow.inProgress}</strong></span>
                          <span><em>Completed</em><strong>{summaryRow.completed}</strong></span>
                        </div>
                      </td>
                      <td>
                        {latest ? (
                          <div className="org2-latest">
                            <Link href={`/assessments/${latest.id}`}><strong>{latest.reference}</strong></Link>
                            <span className="muted small">{new Date(latest.updatedAt).toLocaleDateString('en-ZA')}</span>
                          </div>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {score !== null && !Number.isNaN(score) ? (
                          <span className={`org2-score-pill risk-${riskTone(band)}`}>{score.toFixed(0)}</span>
                        ) : '—'}
                      </td>
                      <td>
                        {band ? (
                          <span className={`org2-risk-badge risk-${riskTone(band)}`}>
                            {band === 'Controlled' ? 'Low' : band}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <span className={`org2-status-badge ${active ? 'active' : 'inactive'}`}>
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="org2-actions-cell">
                        <RowActionsMenu
                          open={menuOpenId === org.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label="Organisation actions"
                              onClick={() => setMenuOpenId((id) => (id === org.id ? null : org.id))}
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <Link href={`/organisations/${org.id}`} onClick={() => setMenuOpenId(null)}>Open details</Link>
                          <Link href={`/assessments/new?org=${org.id}`} onClick={() => setMenuOpenId(null)}>New assessment</Link>
                          {latest && (
                            <Link href={`/assessments/${latest.id}/review`} onClick={() => setMenuOpenId(null)}>Review latest</Link>
                          )}
                          {isAdmin && (
                            <>
                              <button type="button" onClick={() => startEdit(org)} disabled={busyId === org.id}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void deleteOrganisation(org)}
                                disabled={busyId === org.id}
                              >
                                {busyId === org.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </>
                          )}
                        </RowActionsMenu>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !pageItems.length && (
                  <tr><td colSpan={9} className="muted">No organisations match the current filters.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan={9} className="muted">Loading organisations…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="org2-pagination">
            <span>
              Showing {showingFrom} to {showingTo} of {filtered.length} organisations
            </span>
            <div className="org2-pagination-controls">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
                .reduce<number[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push(-1);
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, idx) => (
                  n === -1 ? (
                    <span key={`gap-${idx}`} className="org2-page-gap">…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      className={n === currentPage ? 'active' : ''}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                ))}
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </Shell>
    </AuthGate>
  );
}
