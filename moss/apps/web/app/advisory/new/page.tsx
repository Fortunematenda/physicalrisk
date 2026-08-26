'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

const PRODUCTS = [
  ['EXECUTIVE_ADVISORY_DIAGNOSTIC', 'Level 2 — Executive Advisory Diagnostic'],
  ['SCLI_COST_LEAKAGE', 'Level 3 — Security Cost Leakage Assessment™'],
  ['CONTRACT_SLA_ASSURANCE', 'Level 3 — Contract & SLA Assurance Review'],
  ['VENDOR_PERFORMANCE_ASSURANCE', 'Level 3 — Vendor Performance Assurance Review'],
  ['GOVERNANCE_EXECUTIVE_ASSURANCE', 'Level 3 — Security Governance & Executive Assurance Review'],
  ['CYBER_PHYSICAL_DEPENDENCY', 'Level 3 — Cyber-Physical Dependency Review'],
  ['SHIELD360', 'Sustainable solution — Shield 360'],
] as const;

export default function NewAdvisory() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [organisationId, setOrg] = useState('');
  const [productCode, setProduct] = useState('EXECUTIVE_ADVISORY_DIAGNOSTIC');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<any[]>('/organisations')
      .then((x) => {
        setOrgs(x);
        if (x[0]) setOrg(x[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (productCode === 'SCLI_COST_LEAKAGE') {
        const a = await apiFetch<any>('/assessments', {
          method: 'POST',
          body: JSON.stringify({ organisationId, title: title || undefined }),
        });
        router.push(`/assessments/${a.id}`);
        return;
      }
      const a = await apiFetch<any>('/advisory', {
        method: 'POST',
        body: JSON.stringify({ organisationId, productCode, title: title || undefined }),
      });
      router.push(`/advisory/${a.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <Shell title="New advisory engagement">
        {error ? <p className="error">{error}</p> : null}
        <Card className="max-w-3xl rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Product journey</CardTitle>
            <CardDescription>
              Create paid Level 2 or Level 3 work only. The complimentary Executive Governance Triage remains at
              /start and is never created here as an assessment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Organisation</Label>
                  <FilterSelect
                    value={organisationId}
                    onChange={setOrg}
                    includeAll={false}
                    placeholder="Select organisation"
                    options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Product</Label>
                  <FilterSelect
                    value={productCode}
                    onChange={setProduct}
                    includeAll={false}
                    placeholder="Select product"
                    options={PRODUCTS.map(([k, v]) => ({ value: k, label: v }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="advisory-title">Engagement title (optional)</Label>
                  <Input
                    id="advisory-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to organisation + product name"
                  />
                </div>
              </div>
              <Button type="submit" disabled={busy || !organisationId}>
                {busy ? 'Creating…' : 'Create engagement'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
