'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { StatusBadge } from '../../../components/Ui';
import { IndustrySelect } from '@/components/organisations/IndustrySelect';
import { apiFetch, money } from '../../../lib/api';

type Tab = 'overview' | 'cost-leakage' | 'moss' | 'somod' | 'edit';

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
  const confirm = useConfirm();
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
    const scl = data?.productCounts?.costLeakage ?? data?.costLeakageAssessments?.length ?? 0;
    const moss = data?.productCounts?.moss ?? data?.mossAssessments?.length ?? 0;
    const somod = data?.productCounts?.somod ?? data?.somodAssessments?.length ?? 0;
    const total = scl + moss + somod;
    const ok = await confirm({
      title: 'Delete organisation',
      description: total
        ? `Delete “${data?.name}” and its ${total} related diagnostic(s)? This cannot be undone.`
        : `Delete “${data?.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
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

  const costLeakage = data.costLeakageAssessments || data.assessments || [];
  const mossAssessments = data.mossAssessments || [];
  const somodAssessments = data.somodAssessments || [];
  const leads = data.publicLeads || [];
  const counts = data.productCounts || {
    costLeakage: costLeakage.length,
    moss: mossAssessments.length,
    somod: somodAssessments.length,
  };

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
            <div><span>Cost Leakage</span><strong>{counts.costLeakage}</strong></div>
            <div><span>MOSS</span><strong>{counts.moss}</strong></div>
            <div><span>SOMOD</span><strong>{counts.somod}</strong></div>
            <div><span>CRM</span><strong style={{ fontSize: 16 }}>{data.espocrmAccountId ? 'Linked' : '—'}</strong></div>
          </div>
        </section>

        <div className="tabs">
          <button type="button" className={`tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button
            type="button"
            className={`tab${tab === 'cost-leakage' ? ' active' : ''}`}
            onClick={() => setTab('cost-leakage')}
          >
            Cost Leakage ({counts.costLeakage})
          </button>
          <button type="button" className={`tab${tab === 'moss' ? ' active' : ''}`} onClick={() => setTab('moss')}>
            MOSS ({counts.moss})
          </button>
          <button type="button" className={`tab${tab === 'somod' ? ' active' : ''}`} onClick={() => setTab('somod')}>
            SOMOD ({counts.somod})
          </button>
          <button type="button" className={`tab${tab === 'edit' ? ' active' : ''}`} onClick={() => setTab('edit')}>
            Edit
          </button>
        </div>

        {tab === 'overview' && (
          <div className="org-detail-grid">
            <section className="org-panel">
              <h2>Profile</h2>
              <div className="org-kv">
                <div><span>Name</span><strong>{data.name}</strong></div>
                <div><span>Industry</span><strong>{data.industry || '—'}</strong></div>
                <div><span>Registration</span><strong>{data.registrationNo || '—'}</strong></div>
                <div>
                  <span>Website</span>
                  <strong>
                    {data.website ? (
                      <a
                        href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {data.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </strong>
                </div>
                <div><span>Email</span><strong>{data.primaryEmail || '—'}</strong></div>
                <div><span>Phone</span><strong>{data.primaryPhone || '—'}</strong></div>
                <div><span>Created</span><strong>{new Date(data.createdAt).toLocaleString('en-ZA')}</strong></div>
                <div><span>Updated</span><strong>{new Date(data.updatedAt).toLocaleString('en-ZA')}</strong></div>
                <div><span>Public leads</span><strong>{leads.length}</strong></div>
              </div>
            </section>

            <section className="org-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Diagnostics by product</h2>
                  <p className="muted small">Open a product tab for the full list</p>
                </div>
              </div>
              <div className="list">
                <div className="list-item">
                  <strong>Cost Leakage</strong>
                  <span className="muted small">{counts.costLeakage} assessment(s)</span>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn secondary" onClick={() => setTab('cost-leakage')}>
                      View Cost Leakage
                    </button>
                  </div>
                </div>
                <div className="list-item">
                  <strong>MOSS</strong>
                  <span className="muted small">{counts.moss} assessment(s)</span>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn secondary" onClick={() => setTab('moss')}>
                      View MOSS
                    </button>
                  </div>
                </div>
                <div className="list-item">
                  <strong>SOMOD</strong>
                  <span className="muted small">{counts.somod} assessment(s)</span>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn secondary" onClick={() => setTab('somod')}>
                      View SOMOD
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'cost-leakage' && (
          <section className="org-panel">
            <div className="dash-panel-head">
              <div>
                <h2>Cost Leakage for {data.name}</h2>
                <p className="muted small">SCLI sessions linked to this organisation</p>
              </div>
              <Link className="btn" href={`/assessments/new?org=${id}`}>
                New Cost Leakage
              </Link>
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
                  {costLeakage.map((a: any) => {
                    const s = a.scoreSnapshots?.[0];
                    const l = s?.leakageResult as any;
                    const incomplete = !(
                      a.publicLead?.status === 'COMPLETED' ||
                      ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'APPROVED'].includes(a.status)
                    );
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
                              <span className="muted small">
                                {a.publicLead.firstName} {a.publicLead.lastName} · {a.publicLead.email}
                              </span>
                            </>
                          )}
                        </td>
                        <td><StatusBadge value={a.source === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL'} /></td>
                        <td><StatusBadge value={a.status} /></td>
                        <td style={{ minWidth: 170 }}>
                          {a.progress ? (
                            <>
                              <div className="assess-progress">
                                <span style={{ width: `${Math.max(a.progress.percent || 0, 4)}%` }} />
                              </div>
                              <span className="small">
                                <strong>{a.progress.percent || 0}%</strong> · {a.progress.label}
                              </span>
                              {incomplete && (
                                <>
                                  <br />
                                  <span className="muted small">
                                    Cal {a.progress.inputsAnswered}/{a.progress.inputsTotal} · Q{' '}
                                    {a.progress.questionsAnswered}/{a.progress.questionsTotal}
                                  </span>
                                </>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {s ? (
                            <>
                              <StatusBadge value={s.riskBand} />
                              <br />
                              <span className="small">{Number(s.overallRiskScore).toFixed(1)}/100</span>
                            </>
                          ) : (
                            'Not evaluated'
                          )}
                        </td>
                        <td>{s ? money(Number(l?.likelyLeakageValue || 0)) : '—'}</td>
                        <td>{new Date(a.updatedAt).toLocaleDateString('en-ZA')}</td>
                        <td>
                          <Link className="btn secondary" href={`/assessments/${a.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!costLeakage.length && (
                    <tr>
                      <td colSpan={9} className="muted">
                        No Cost Leakage assessments for this organisation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'moss' && (
          <section className="org-panel">
            <div className="dash-panel-head">
              <div>
                <h2>MOSS for {data.name}</h2>
                <p className="muted small">Master Catalogue control assessments</p>
              </div>
              <Link className="btn" href={`/moss/assessments/new?org=${id}`}>
                New MOSS
              </Link>
            </div>
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Site</th>
                    <th>Catalogue</th>
                    <th>Status</th>
                    <th>Controls scored</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mossAssessments.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.reference}</strong>
                      </td>
                      <td>{a.title}</td>
                      <td>
                        {a.site ? `${a.site.siteCode} — ${a.site.name}` : '—'}
                      </td>
                      <td>
                        {a.mossCatalogueVersion?.version
                          ? `v${a.mossCatalogueVersion.version}`
                          : '—'}
                      </td>
                      <td><StatusBadge value={a.status} /></td>
                      <td>{a._count?.mossControlAssessments ?? 0}</td>
                      <td>{new Date(a.updatedAt).toLocaleDateString('en-ZA')}</td>
                      <td>
                        <Link className="btn secondary" href={`/moss/assessments/${a.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!mossAssessments.length && (
                    <tr>
                      <td colSpan={8} className="muted">
                        No MOSS assessments for this organisation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'somod' && (
          <section className="org-panel">
            <div className="dash-panel-head">
              <div>
                <h2>SOMOD for {data.name}</h2>
                <p className="muted small">Optimisation diagnostic assessments</p>
              </div>
              <Link className="btn" href={`/somod/assessments/new?org=${id}`}>
                New SOMOD
              </Link>
            </div>
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Site</th>
                    <th>Linked MOSS</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {somodAssessments.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.reference}</strong>
                      </td>
                      <td>{a.title}</td>
                      <td>
                        {a.site ? `${a.site.siteCode} — ${a.site.name}` : '—'}
                      </td>
                      <td>{a.mossAssessment?.reference || '—'}</td>
                      <td><StatusBadge value={a.status} /></td>
                      <td>{new Date(a.updatedAt).toLocaleDateString('en-ZA')}</td>
                      <td>
                        <Link className="btn secondary" href={`/somod/assessments/${a.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!somodAssessments.length && (
                    <tr>
                      <td colSpan={7} className="muted">
                        No SOMOD assessments for this organisation.
                      </td>
                    </tr>
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
                <p className="muted small">Update profile details used across diagnostics and CRM</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="org-detail-industry">Industry</label>
                <IndustrySelect
                  id="org-detail-industry"
                  value={form.industry}
                  onChange={(industry) => setForm({ ...form, industry })}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label>Registration no.</label>
                <input
                  value={form.registrationNo}
                  onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Website</label>
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="field">
                <label>Primary email</label>
                <input
                  type="email"
                  value={form.primaryEmail}
                  onChange={(e) => setForm({ ...form, primaryEmail: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Primary phone</label>
                <input
                  value={form.primaryPhone}
                  onChange={(e) => setForm({ ...form, primaryPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="assess-nav" style={{ borderTop: '1px solid var(--line)', marginTop: 22, paddingTop: 18 }}>
              <button type="button" className="btn secondary" onClick={() => setTab('overview')}>
                Cancel
              </button>
              <button className="btn" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Shell>
    </AuthGate>
  );
}
