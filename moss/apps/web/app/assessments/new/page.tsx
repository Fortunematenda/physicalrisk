'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { apiFetch } from '../../../lib/api';

type Org = { id: string; name: string };

export default function NewAssessmentPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [organisationId, setOrganisationId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const prefOrg = new URLSearchParams(window.location.search).get('org') || '';
    apiFetch<Org[]>('/organisations')
      .then((x) => {
        setOrgs(x);
        if (prefOrg && x.some((o) => o.id === prefOrg)) setOrganisationId(prefOrg);
        else if (x[0]) setOrganisationId(x[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const x = await apiFetch<{ id: string }>('/assessments', {
        method: 'POST',
        body: JSON.stringify({
          organisationId,
          questionnaireCode: 'SCLI',
          title: title || undefined,
        }),
      });
      router.push(`/assessments/${x.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create assessment.');
    }
  }

  return (
    <AuthGate>
      <Shell title="Create Assessment">
        <form className="card" style={{ maxWidth: 760 }} onSubmit={submit}>
          <h2>Start a new SCLI assessment</h2>
          <p className="muted">The session will be pinned to the currently published SCLI methodology version.</p>
          {error && <p className="error">{error}</p>}
          <div className="field">
            <label>Organisation</label>
            <select required value={organisationId} onChange={(e) => setOrganisationId(e.target.value)}>
              <option value="">Select organisation</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 15 }}>
            <label>Assessment title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional custom title" />
          </div>
          <div style={{ marginTop: 20 }}>
            <button className="btn" disabled={!organisationId}>Create assessment</button>
          </div>
        </form>
      </Shell>
    </AuthGate>
  );
}
