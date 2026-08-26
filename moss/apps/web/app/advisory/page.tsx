'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { apiFetch } from '@/lib/api';

const LABELS: Record<string, string> = {
  EXECUTIVE_ADVISORY_DIAGNOSTIC: 'Executive Advisory Diagnostic',
  CONTRACT_SLA_ASSURANCE: 'Contract & SLA Assurance Review',
  VENDOR_PERFORMANCE_ASSURANCE: 'Vendor Performance Assurance Review',
  GOVERNANCE_EXECUTIVE_ASSURANCE: 'Security Governance & Executive Assurance Review',
  CYBER_PHYSICAL_DEPENDENCY: 'Cyber-Physical Dependency Review',
  SHIELD360: 'Shield 360',
};

export default function AdvisoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    apiFetch<any[]>('/advisory').then(setItems).catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(
    () => (filter === 'ALL' ? items : items.filter((x) => x.productCode === filter)),
    [items, filter],
  );

  return (
    <AuthGate>
      <Shell title="Executive Advisory">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold">Paid diagnostics and focused assurance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Level 2 Executive Advisory Diagnostic → Level 3 focused assurance → sustainable remediation.
            </p>
          </div>
          <Button asChild>
            <Link href="/advisory/new">+ New engagement</Link>
          </Button>
        </div>
        {error ? <p className="error">{error}</p> : null}

        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium">Product</p>
              <FilterSelect
                value={filter}
                onChange={setFilter}
                includeAll={false}
                placeholder="All advisory products"
                options={[
                  { value: 'ALL', label: 'All advisory products' },
                  ...Object.entries(LABELS).map(([k, v]) => ({ value: k, label: v })),
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Engagements</CardTitle>
            <CardDescription>{rows.length} record{rows.length === 1 ? '' : 's'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Organisation</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Consultant</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Evidence</th>
                    <th className="px-3 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const a = x.assignments?.find(
                      (row: any) => row.role === 'PRIMARY_ANALYST' && row.status !== 'CANCELLED',
                    );
                    return (
                      <tr key={x.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <Link href={`/advisory/${x.id}`}>
                            <strong>{x.reference}</strong>
                          </Link>
                        </td>
                        <td className="px-3 py-2">{x.organisation?.name}</td>
                        <td className="px-3 py-2">{LABELS[x.productCode] || x.productCode}</td>
                        <td className="px-3 py-2">
                          {a ? `${a.user.firstName} ${a.user.lastName}` : 'Unassigned'}
                        </td>
                        <td className="px-3 py-2">{x.status}</td>
                        <td className="px-3 py-2">{x._count?.evidence || 0}</td>
                        <td className="px-3 py-2">{new Date(x.updatedAt).toLocaleDateString('en-ZA')}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        No advisory engagements yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
