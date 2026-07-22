'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Calculator,
  Calendar,
  List,
  Lock,
  TrendingUp,
} from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import {
  IconCalculator,
  IconClipboard,
  IconDownload,
  IconEye,
  IconFileText,
  IconInfo,
  IconList,
  IconLock,
  IconRotateCcw,
  IconSearch,
  IconTrendingUp,
} from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../../lib/api';

type Assumption = {
  id: string;
  code: string;
  label: string;
  value: number | string;
  format?: string | null;
  description?: string | null;
  dataType?: string | null;
  unit?: string | null;
  formulaUsage?: string | null;
  status?: string | null;
};

type UsageArea = 'Leakage' | 'Confidence' | 'Opportunity' | 'Shared';

const PAGE_SIZE_OPTIONS = [10, 16, 20, 50];

const USAGE_COLORS: Record<UsageArea, string> = {
  Leakage: '#c41230',
  Confidence: '#2563eb',
  Opportunity: '#ea580c',
  Shared: '#7c3aed',
};

function usageArea(a: Assumption): UsageArea {
  const raw = `${a.formulaUsage || ''} ${a.code} ${a.label} ${a.description || ''}`.toLowerCase();
  const hasLeakage = /leakage|exposure|recoverable|saturation|allowance|patrol|attendance|supervis/.test(raw);
  const hasConfidence = /confidence|evidence|methodology|maturity/.test(raw);
  const hasOpportunity = /opportunity|engagement|urgency|readiness/.test(raw);
  const hits = [hasLeakage, hasConfidence, hasOpportunity].filter(Boolean).length;
  if (hits > 1) return 'Shared';
  if (hasOpportunity) return 'Opportunity';
  if (hasConfidence) return 'Confidence';
  if (hasLeakage) return 'Leakage';
  if (a.formulaUsage) {
    const fu = a.formulaUsage.toLowerCase();
    if (fu.includes('opportunity')) return 'Opportunity';
    if (fu.includes('confidence')) return 'Confidence';
    if (fu.includes('leakage')) return 'Leakage';
  }
  return 'Shared';
}

function formatValue(a: Assumption) {
  const num = Number(a.value);
  const fmt = (a.format || a.unit || a.dataType || '').toLowerCase();
  if (Number.isNaN(num)) return String(a.value);
  if (fmt.includes('percent') || fmt === '%' || a.unit === '%') {
    const pct = Math.abs(num) <= 1 ? num * 100 : num;
    return `${pct.toFixed(num % 1 === 0 ? 0 : 1)}%`;
  }
  if (fmt.includes('currency') || fmt.includes('zar') || (a.unit || '').toUpperCase() === 'ZAR') {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0,
    }).format(num);
  }
  if (Math.abs(num) >= 1000) {
    return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(num);
  }
  return Number.isInteger(num) ? String(num) : num.toFixed(4).replace(/\.?0+$/, '');
}

function formatUnit(a: Assumption) {
  if (a.unit) return a.unit;
  const fmt = (a.format || '').toLowerCase();
  if (fmt.includes('percent')) return 'Percent';
  if (fmt.includes('currency') || fmt.includes('zar')) return 'ZAR';
  if (fmt) return a.format as string;
  return a.dataType || 'Number';
}

export default function AssumptionsPage() {
  const [version, setVersion] = useState<any>(null);
  const [questionnaire, setQuestionnaire] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [query, setQuery] = useState('');
  const [usageFilter, setUsageFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/questionnaires/SCLI')
      .then((q) => {
        setQuestionnaire(q);
        const published = (q.versions || []).find((v: any) => v.status === 'PUBLISHED') || q.versions?.[0];
        setVersion(published);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const assumptions: Assumption[] = version?.assumptions || [];
  const calibrationCount = version?.inputDefinitions?.length || 0;
  const questionCount = version?.questions?.length || 0;

  const enriched = useMemo(() => {
    return assumptions.map((a) => ({
      ...a,
      usage: usageArea(a),
      displayValue: formatValue(a),
      displayUnit: formatUnit(a),
      dataTypeLabel: a.dataType || a.format || 'NUMBER',
    }));
  }, [assumptions]);

  const usageCounts = useMemo(() => {
    const counts: Record<UsageArea, number> = {
      Leakage: 0,
      Confidence: 0,
      Opportunity: 0,
      Shared: 0,
    };
    for (const a of enriched) counts[a.usage] += 1;
    return counts;
  }, [enriched]);

  const dataTypes = useMemo(() => {
    return [...new Set(enriched.map((a) => a.dataTypeLabel))].sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return enriched.filter((a) => {
      if (q) {
        const hay = [a.code, a.label, a.description, a.usage, a.displayUnit].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (usageFilter && a.usage !== usageFilter) return false;
      if (typeFilter && a.dataTypeLabel !== typeFilter) return false;
      if (versionFilter && String(version?.version) !== versionFilter) return false;
      return true;
    });
  }, [enriched, query, headerSearch, usageFilter, typeFilter, versionFilter, version]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, usageFilter, typeFilter, versionFilter, pageSize]);

  const usageDonut = useMemo(() => {
    return (Object.entries(usageCounts) as Array<[UsageArea, number]>)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: USAGE_COLORS[name],
      }));
  }, [usageCounts]);

  const selected = enriched.find((a) => a.id === selectedId) || null;
  const lastUpdated = version?.publishedAt || version?.updatedAt || version?.createdAt;
  const activeCount = enriched.filter((a) => (a.status || 'ACTIVE') === 'ACTIVE').length;

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setUsageFilter('');
    setTypeFilter('');
    setVersionFilter('');
  }

  function exportCsv() {
    const rows = [
      ['Code', 'Description', 'Value', 'Unit / Format', 'Where Used', 'Methodology', 'Status'],
      ...filtered.map((a) => [
        a.code,
        a.description || a.label,
        a.displayValue,
        a.displayUnit,
        a.usage,
        String(version?.version || ''),
        a.status || 'ACTIVE',
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-scli-assumptions-v${version?.version || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = Math.max(enriched.length, 1);

  return (
    <AuthGate>
      <Shell
        title="Assumptions"
        eyebrow="Methodology"
        subtitle="View the seeded SCLI calculation assumptions used by the scoring, leakage and confidence model."
        searchPlaceholder="Search assumptions…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
          <Link href="/admin/methodology" className="btn secondary org2-export-btn">
            <IconFileText />
            View Methodology Notes
          </Link>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={List}
            title="Total Assumptions"
            value={enriched.length}
            description={`${activeCount} Active`}
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={TrendingUp}
            title="Methodology Version"
            value={version?.version || '—'}
            description="Current"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={Calculator}
            title="Formula Usage"
            value="3 domains"
            description="Leakage / Confidence / Opportunity"
            tone="slate"
            loading={loading}
          />
          <StatCard
            icon={Lock}
            title="Editable in MVP"
            value="No"
            description="Read-only"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={Calendar}
            title="Last Updated"
            value={
              !lastUpdated
                ? '—'
                : new Date(lastUpdated).toLocaleDateString('en-ZA', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
            }
            description={questionnaire?.name || 'SCLI'}
            tone="green"
            loading={loading}
          />
        </div>

        <div className="queue2-layout">
          <div className="meth2-main">
            <section className="dash2-card org2-filters-card">
              <div className="assess2-filters assume2-filters">
                <label className="org2-filter-search">
                  <IconSearch />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search assumptions by code or description…"
                    aria-label="Filter assumptions"
                  />
                </label>
                <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)} aria-label="Usage area">
                  <option value="">Usage Area (All)</option>
                  {(['Leakage', 'Confidence', 'Opportunity', 'Shared'] as UsageArea[]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Data type">
                  <option value="">Data Type (All)</option>
                  {dataTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)} aria-label="Methodology version">
                  <option value="">Methodology Version (All)</option>
                  {version?.version && <option value={String(version.version)}>{version.version}</option>}
                </select>
                <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
                  <IconRotateCcw />
                  Clear
                </button>
              </div>
            </section>

            <section className="dash2-card org2-table-card">
              <div className="table-wrap">
                <table className="assume2-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Value</th>
                      <th>Unit / Format</th>
                      <th>Where Used</th>
                      <th>Methodology</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((a) => (
                      <tr key={a.id} className={selectedId === a.id ? 'selected' : ''}>
                        <td><strong className="assume2-code">{a.code}</strong></td>
                        <td>
                          <div className="assume2-desc">
                            <strong>{a.label}</strong>
                            {a.description && a.description !== a.label && (
                              <span className="muted small">{a.description}</span>
                            )}
                          </div>
                        </td>
                        <td><strong>{a.displayValue}</strong></td>
                        <td>{a.displayUnit}</td>
                        <td>
                          <span className={`assume2-usage usage-${a.usage.toLowerCase()}`}>{a.usage}</span>
                        </td>
                        <td>v{version?.version}</td>
                        <td>
                          <span className="org2-status-badge active">{(a.status || 'ACTIVE').toUpperCase()}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="reports2-icon-btn"
                            title="View assumption"
                            aria-label={`View ${a.code}`}
                            onClick={() => setSelectedId((id) => (id === a.id ? null : a.id))}
                          >
                            <IconEye />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!loading && !pageItems.length && (
                      <tr><td colSpan={8} className="muted">No assumptions match the current filters.</td></tr>
                    )}
                    {loading && (
                      <tr><td colSpan={8} className="muted">Loading assumptions…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="org2-pagination">
                <span>
                  Showing {showingFrom} to {showingTo} of {filtered.length} assumptions
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

            {selected && (
              <section className="dash2-card assume2-detail">
                <div className="dash2-card-head">
                  <div>
                    <h2>{selected.code}</h2>
                    <p>{selected.label}</p>
                  </div>
                  <button type="button" className="btn secondary" onClick={() => setSelectedId(null)}>Close</button>
                </div>
                <div className="assume2-detail-grid">
                  <div><em>Value</em><strong>{selected.displayValue}</strong></div>
                  <div><em>Unit / Format</em><strong>{selected.displayUnit}</strong></div>
                  <div><em>Where Used</em><strong>{selected.usage}</strong></div>
                  <div><em>Status</em><strong>{selected.status || 'ACTIVE'}</strong></div>
                </div>
                <p className="muted">{selected.description || 'No additional description provided for this assumption.'}</p>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Formula usage: {selected.formulaUsage || 'Seeded SCLI calculation constant (read-only in Lean MVP).'}
                </p>
              </section>
            )}
          </div>

          <aside className="queue2-side">
            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>SCLI v{version?.version || '—'} Overview</h2>
                  <p>Methodology snapshot</p>
                </div>
              </div>
              <ul className="meth2-overview">
                <li>
                  <span><IconList /> Total Assumptions</span>
                  <strong>{enriched.length}</strong>
                </li>
                <li>
                  <span><IconCalculator /> Calibration Inputs</span>
                  <strong>{calibrationCount}</strong>
                </li>
                <li>
                  <span><IconClipboard /> Questions</span>
                  <strong>{questionCount}</strong>
                </li>
                <li>
                  <span><IconTrendingUp /> Version</span>
                  <strong>{version?.version || '—'}</strong>
                </li>
                <li>
                  <span><IconLock /> Editability</span>
                  <strong>Read-only</strong>
                </li>
              </ul>
            </section>

            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Usage Summary</h2>
                  <p>Assumptions by formula domain</p>
                </div>
              </div>
              <div className="dash2-donut-wrap compact">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={usageDonut.length ? usageDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(usageDonut.length ? usageDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash2-donut-center">
                  <span>ASSUMPTIONS</span>
                  <strong>{enriched.length}</strong>
                  <em>Total</em>
                </div>
              </div>
              <ul className="dash2-legend">
                {usageDonut.map((entry) => (
                  <li key={entry.name}>
                    <i style={{ background: entry.color }} />
                    <span>{entry.name}</span>
                    <strong>{entry.value}</strong>
                    <em>{Math.round((entry.value / total) * 100)}%</em>
                  </li>
                ))}
                {!usageDonut.length && <li className="muted">No assumptions loaded.</li>}
              </ul>
            </section>

            <section className="dash2-card assume2-guidance">
              <div className="dash2-card-head">
                <div>
                  <h2><IconInfo /> Guidance</h2>
                  <p>Lean MVP policy</p>
                </div>
              </div>
              <p>
                These assumptions are seeded with the published SCLI methodology and are
                <strong> read-only</strong> in the Lean Revenue MVP. Submitted assessments retain the
                questionnaire version (and constants) used at submission time.
              </p>
              <Link href="/admin/methodology" className="btn secondary">
                <IconFileText />
                Open Questionnaire & Calibration
              </Link>
            </section>
          </aside>
        </div>
      </Shell>
    </AuthGate>
  );
}
