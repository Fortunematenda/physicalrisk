'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import {
  IconBuilding2,
  IconCalendar,
  IconCable,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconDownload,
  IconEye,
  IconFileText,
  IconFilter,
  IconLogOut,
  IconMail,
  IconPencil,
  IconPlus,
  IconRotateCcw,
  IconSettings,
  IconShieldCheck,
  IconTrash,
  IconUsers,
} from '../../../components/NavIcons';
import { apiFetch } from '../../../lib/api';

type UiAction =
  | 'created'
  | 'updated'
  | 'viewed'
  | 'exported'
  | 'deleted'
  | 'login'
  | 'failed_login'
  | 'system_update';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  organisationId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  userName: string;
  userRole: string;
  uiAction: UiAction;
  actionLabel: string;
  module: string;
  moduleLabel: string;
  recordName: string;
  recordCode: string;
  details: string;
  status: 'success' | 'failed';
  statusLabel: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
  } | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SY';
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ActionIcon({ action }: { action: UiAction }) {
  switch (action) {
    case 'created':
      return <IconPlus />;
    case 'updated':
      return <IconPencil />;
    case 'viewed':
      return <IconEye />;
    case 'exported':
      return <IconDownload />;
    case 'deleted':
      return <IconTrash />;
    case 'login':
      return <IconLogOut />;
    case 'failed_login':
      return <IconShieldCheck />;
    case 'system_update':
      return <IconSettings />;
    default:
      return <IconPencil />;
  }
}

function ModuleIcon({ module }: { module: string }) {
  switch (module) {
    case 'organisation':
      return <IconBuilding2 />;
    case 'assessment':
      return <IconClipboardList />;
    case 'report':
      return <IconFileText />;
    case 'email':
      return <IconMail />;
    case 'crm':
      return <IconCable />;
    case 'system':
      return <IconSettings />;
    default:
      return <IconUsers />;
  }
}

function pageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | '…'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    apiFetch<AuditRow[]>('/admin/audit-logs')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const users = useMemo(() => {
    return [...new Set(items.map((i) => i.userName).filter(Boolean))].sort();
  }, [items]);

  const actions = useMemo(() => {
    return [...new Set(items.map((i) => i.uiAction))].sort();
  }, [items]);

  const modules = useMemo(() => {
    return [...new Set(items.map((i) => i.moduleLabel))].sort();
  }, [items]);

  const recordTypes = useMemo(() => {
    return [...new Set(items.map((i) => i.entityType))].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    const rows = items.filter((row) => {
      if (userFilter && row.userName !== userFilter) return false;
      if (actionFilter && row.uiAction !== actionFilter) return false;
      if (moduleFilter && row.moduleLabel !== moduleFilter) return false;
      if (recordTypeFilter && row.entityType !== recordTypeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (dateFrom && new Date(row.createdAt) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(row.createdAt) > to) return false;
      }
      if (q) {
        const hay = [
          row.userName,
          row.userRole,
          row.actionLabel,
          row.moduleLabel,
          row.recordName,
          row.recordCode,
          row.details,
          row.ipAddress,
          row.entityType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDesc ? -diff : diff;
    });
    return rows;
  }, [
    items,
    headerSearch,
    userFilter,
    actionFilter,
    moduleFilter,
    recordTypeFilter,
    statusFilter,
    dateFrom,
    dateTo,
    sortDesc,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [headerSearch, userFilter, actionFilter, moduleFilter, recordTypeFilter, statusFilter, dateFrom, dateTo, pageSize]);

  function clearFilters() {
    setHeaderSearch('');
    setUserFilter('');
    setActionFilter('');
    setModuleFilter('');
    setRecordTypeFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
  }

  function exportCsv() {
    const rows = [
      ['Date & Time', 'User', 'Role', 'Action', 'Module', 'Record', 'Record Code', 'Details', 'IP Address', 'Status'],
      ...filtered.map((row) => [
        formatDateTime(row.createdAt),
        row.userName,
        row.userRole,
        row.actionLabel,
        row.moduleLabel,
        row.recordName,
        row.recordCode,
        row.details,
        row.ipAddress || '',
        row.statusLabel,
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showRetention() {
    setNotice('Retention is currently set to keep audit events indefinitely in this MVP. Configure archival policy in a later release.');
  }

  const actionLabelOf = (key: string) => {
    const map: Record<string, string> = {
      created: 'Created',
      updated: 'Updated',
      viewed: 'Viewed',
      exported: 'Exported',
      deleted: 'Deleted',
      login: 'Login',
      failed_login: 'Failed Login',
      system_update: 'System Update',
    };
    return map[key] || key;
  };

  return (
    <AuthGate>
      <Shell
        title="Audit Logs"
        hideEyebrow
        subtitle="Track user activities and system changes for security and compliance."
        searchPlaceholder="Search logs, users, actions…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export Logs
          </button>
          <button type="button" className="btn secondary org2-export-btn" onClick={showRetention}>
            <IconSettings />
            Retention Settings
          </button>
        </div>

        <section className="dash2-card org2-filters-card">
          <div className="assess2-filters audit2-filters">
            <label className="assess2-date-range">
              <IconCalendar />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
              <span>—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            </label>
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="User">
              <option value="">User (All Users)</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Action">
              <option value="">Action (All Actions)</option>
              {actions.map((a) => <option key={a} value={a}>{actionLabelOf(a)}</option>)}
            </select>
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label="Module">
              <option value="">Module (All Modules)</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={recordTypeFilter} onChange={(e) => setRecordTypeFilter(e.target.value)} aria-label="Record type">
              <option value="">Record Type (All Record Types)</option>
              {recordTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Status (All Statuses)</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <button type="button" className="dash2-filter-btn" title="Filters">
              <IconFilter />
              Filters
            </button>
            <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
              <IconRotateCcw />
              Clear
            </button>
          </div>
        </section>

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="audit2-table">
              <thead>
                <tr>
                  <th className="audit2-icon-col" aria-hidden />
                  <th>
                    <button
                      type="button"
                      className="audit2-sort"
                      onClick={() => setSortDesc((v) => !v)}
                    >
                      Date & Time
                      <span>{sortDesc ? '↓' : '↑'}</span>
                    </button>
                  </th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Record</th>
                  <th>Details</th>
                  <th>IP Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={`audit2-action-icon tone-${row.uiAction}`}>
                        <ActionIcon action={row.uiAction} />
                      </span>
                    </td>
                    <td className="muted small">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <div className="audit2-user">
                        <span className="audit2-avatar">{initials(row.userName)}</span>
                        <div>
                          <strong>{row.userName}</strong>
                          <em>{row.userRole}</em>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`audit2-action action-${row.uiAction}`}>{row.actionLabel}</span>
                    </td>
                    <td>
                      <div className="audit2-module">
                        <ModuleIcon module={row.module} />
                        <span>{row.moduleLabel}</span>
                      </div>
                    </td>
                    <td>
                      <div className="audit2-record">
                        <strong>{row.recordName}</strong>
                        <span>{row.recordCode}</span>
                      </div>
                    </td>
                    <td className="audit2-details">{row.details}</td>
                    <td className="muted small">{row.ipAddress || '—'}</td>
                    <td>
                      <span className={`audit2-status status-${row.status}`}>{row.statusLabel}</span>
                    </td>
                  </tr>
                ))}
                {!loading && !pageItems.length && (
                  <tr>
                    <td colSpan={9} className="muted">No audit events match the current filters.</td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={9} className="muted">Loading audit logs…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="org2-pagination">
            <p className="muted small">
              Showing {showingFrom} to {showingTo} of {filtered.length.toLocaleString()} logs
            </p>
            <div className="org2-pagination-controls">
              <button
                type="button"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <IconChevronLeft />
              </button>
              {pageNumbers(currentPage, totalPages).map((item, idx) =>
                item === '…' ? (
                  <span key={`e-${idx}`} className="muted">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === currentPage ? 'active' : ''}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <IconChevronRight />
              </button>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </Shell>
    </AuthGate>
  );
}
