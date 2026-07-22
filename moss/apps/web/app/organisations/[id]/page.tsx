'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { apiFetch, money } from '../../../lib/api';

type Tab = 'overview' | 'assessments' | 'edit';

type OrgForm = {
  name: string;
  industry: string;
  primaryEmail: string;
  primaryPhone: string;
  website: string;
  registrationNo: string;
};

export default function OrganisationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<OrgForm>({
    name: '',
    industry: '',
    primaryEmail: '',
    primaryPhone: '',
    website: '',
    registrationNo: '',
  });

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    setLoading(true);
    return apiFetch(`/organisations/${id}`)
      .then((org) => {
        setData(org);
        setForm({
          name: org.name || '',
          industry: org.industry || '',
          primaryEmail: org.primaryEmail || '',
          primaryPhone: org.primaryPhone || '',
          website: org.website || '',
          registrationNo: org.registrationNo || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await apiFetch(`/organisations/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setNotice('Organisation updated.');
      setTab('overview');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const count = data?._count?.assessments ?? data?.assessments?.length ?? 0;
    const ok = window.confirm(
      count
        ? `Delete “${data?.name}” and its ${count} related assessment(s)? This cannot be undone.`
        : `Delete “${data?.name}”? This cannot be undone.`,
    );
    if (!ok) return;
    setError('');
    setDeleting(true);
    try {
      await apiFetch(`/organisations/${id}`, { method: 'DELETE' });
      router.push('/organisations');
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (loading && !data) {
    return (
      <AuthGate>
        <Shell title="Organisation">
          <div className="muted">Loading organisation…</div>
        </Shell>
      </AuthGate>
    );
  }

  if (!data) {
    return (
      <AuthGate>
        <Shell title="Organisation" actions={<Link className="btn secondary" href="/organisations">Back</Link>}>
          {error && <p className="error">{error}</p>}
          <p className="muted">Organisation not found.</p>
        </Shell>
      </AuthGate>
    );
  }

  const assessments = data.assessments || [];
  const leads = data.publicLeads || [];

  return (
    <AuthGate>
      <Shell
        title={data.name}
        actions={
          <>
            <Link className="btn secondary" href="/organisations">Back</Link>
            <button className="btn secondary" type="button" onClick={() => setTab('edit')}>Edit</button>
            <button className="btn danger" type="button" disabled={deleting} onClick={remove}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <section className="org-hero">
          <div>
            <p className="dash-hero-kicker">Organisation details</p>
            <h2>{data.name}</h2>
            <p>
              {[data.industry, data.primaryEmail, data.primaryPhone].filter(Boolean).join(' · ') || 'No contact details recorded yet.'}
            </p>
          </div>
          <div className="org-hero-stats">
            <div><span>Assessments</span><strong>{assessments.length}</strong></div>
            <div><span>Public leads</span><strong>{leads.length}</strong></div>
            <div><span>CRM</span><strong style={{ fontSize: 16 }}>{data.espocrmAccountId ? 'Linked' : '—'}</strong></div>
          </div>
        </section>

        <div className="tabs">
          <button type="button" className={`tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button type="button" className={`tab${tab === 'assessments' ? ' active' : ''}`} onClick={() => setTab('assessments')}>
            Assessments ({assessments.length})
          </button>
          <button type="button" className={`tab${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>Edit</button>
        </div>

        {tab === 'overview' && (
          <div className="org-detail-grid">
            <section className="org-panel">
              <h2>Profile</h2>
              <div className="org-kv">
                <div><span>Name</span><strong>{data.name}</strong></div>
                <div><span>Industry</span><strong>{data.industry || '—'}</strong></div>
                <div><span>Registration</span><strong>{data.registrationNo || '—'}</strong></div>
                <div><span>Website</span><strong>{data.website ? <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`} target="_blank" rel="noreferrer">{data.website}</a> : '—'}</strong></div>
                <div><span>Email</span><strong>{data.primaryEmail || '—'}</strong></div>
                <div><span>Phone</span><strong>{data.primaryPhone || '—'}</strong></div>
                <div><span>Created</span><strong>{new Date(data.createdAt).toLocaleString('en-ZA')}</strong></div>
                <div><span>Updated</span><strong>{new Date(data.updatedAt).toLocaleString('en-ZA')}</strong></div>
              </div>
            </section>

            <section className="org-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Latest assessments</h2>
                  <p className="muted small">Jump to the full list in the Assessments tab</p>
                </div>
                <button type="button" className="btn secondary" onClick={() => setTab('assessments')}>View all</button>
              </div>
              <div className="list">
                {assessments.slice(0, 4).map((a: any) => {
                  const s = a.scoreSnapshots?.[0];
                  return (
                    <div className="list-item" key={a.id}>
                      <strong><Link href={`/assessments/${a.id}`}>{a.reference}</Link></strong>
                      <span className="muted small">{a.title}</span>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <StatusBadge value={a.source === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL'} />
                        <StatusBadge value={a.status} />
                        {s && <span className="small">{Number(s.overallRiskScore).toFixed(1)} · {s.riskBand}</span>}
                      </div>
                    </div>
                  );
                })}
                {!assessments.length && <p className="muted">No assessments linked to this organisation yet.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === 'assessments' && (
          <section className="org-panel">
            <div className="dash-panel-head">
              <div>
                <h2>Assessments for {data.name}</h2>
                <p className="muted small">All SCLI sessions linked to this organisation</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Risk</th>
                    <th>Leakage</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a: any) => {
                    const s = a.scoreSnapshots?.[0];
                    const l = s?.leakageResult as any;
                    const incomplete = !(a.publicLead?.status === 'COMPLETED' || ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'APPROVED'].includes(a.status));
                    return (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.reference}</strong>
                          <br />
                          <span className="muted small">
                            {a.questionnaireVersion?.questionnaire?.code} v{a.questionnaireVersion?.version}
                          </span>
                        </td>
                        <td>
                          {a.title}
                          {a.publicLead && (
                            <>
                              <br />
                              <span className="muted small">{a.publicLead.firstName} {a.publicLead.lastName} · {a.publicLead.email}</span>
                            </>
                          )}
                        </td>
                        <td><StatusBadge value={a.source === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL'} /></td>
                        <td><StatusBadge value={a.status} /></td>
                        <td style={{ minWidth: 170 }}>
                          {a.progress ? (
                            <>
                              <div className="assess-progress"><span style={{ width: `${Math.max(a.progress.percent || 0, 4)}%` }} /></div>
                              <span className="small"><strong>{a.progress.percent || 0}%</strong> · {a.progress.label}</span>
                              {incomplete && (
                                <>
                                  <br />
                                  <span className="muted small">
                                    Cal {a.progress.inputsAnswered}/{a.progress.inputsTotal} · Q {a.progress.questionsAnswered}/{a.progress.questionsTotal}
                                  </span>
                                </>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td>
                          {s ? (
                            <>
                              <StatusBadge value={s.riskBand} />
                              <br />
                              <span className="small">{Number(s.overallRiskScore).toFixed(1)}/100</span>
                            </>
                          ) : 'Not evaluated'}
                        </td>
                        <td>{s ? money(Number(l?.likelyLeakageValue || 0)) : '—'}</td>
                        <td>{new Date(a.updatedAt).toLocaleDateString('en-ZA')}</td>
                        <td><Link className="btn secondary" href={`/assessments/${a.id}`}>Open</Link></td>
                      </tr>
                    );
                  })}
                  {!assessments.length && (
                    <tr><td colSpan={9} className="muted">No assessments for this organisation.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'edit' && (
          <form className="org-panel" onSubmit={save}>
            <div className="dash-panel-head">
              <div>
                <h2>Edit organisation</h2>
                <p className="muted small">Update profile details used across assessments and CRM</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Industry</label>
                <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
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
            <div className="assess-nav" style={{ borderTop: '1px solid var(--line)', marginTop: 22, paddingTop: 18 }}>
              <button type="button" className="btn secondary" onClick={() => setTab('overview')}>Cancel</button>
              <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Shell>
    </AuthGate>
  );
}
