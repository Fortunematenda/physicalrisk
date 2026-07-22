'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { StatusBadge } from '../../components/Ui';
import { apiFetch, money } from '../../lib/api';

export default function ActionsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/actions/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <AuthGate>
      <Shell title="Action plans">
        {error && <p className="error">{error}</p>}
        {!data ? (
          <div className="loading-screen">Loading action plans…</div>
        ) : (
          <>
            <div className="dash-metrics">
              <article className="dash-metric"><div className="dash-metric-top"><span>Open actions</span></div><strong>{data.all?.length || 0}</strong></article>
              <article className="dash-metric warn"><div className="dash-metric-top"><span>Overdue</span></div><strong>{data.overdue?.length || 0}</strong></article>
              <article className="dash-metric"><div className="dash-metric-top"><span>Upcoming</span></div><strong>{data.upcoming?.length || 0}</strong></article>
              <article className="dash-metric accent"><div className="dash-metric-top"><span>Expected benefit</span></div><strong className="dash-metric-money">{money(data.expectedVsRealised?.expected || 0)}</strong></article>
              <article className="dash-metric"><div className="dash-metric-top"><span>Realised benefit</span></div><strong className="dash-metric-money">{money(data.expectedVsRealised?.actual || 0)}</strong></article>
            </div>
            <section className="card">
              <h2>All action items</h2>
              <div className="table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Title</th>
                      <th>Organisation</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Progress</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.all || []).map((item: any) => (
                      <tr key={item.id}>
                        <td><strong>{item.reference}</strong></td>
                        <td>{item.title}</td>
                        <td>{item.organisation?.name}</td>
                        <td>{item.priority}</td>
                        <td><StatusBadge value={item.status} /></td>
                        <td>{item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-ZA') : '—'}</td>
                        <td>{item.progressPercent || 0}%</td>
                        <td>
                          <Link className="btn secondary" href={`/assessments/${item.assessmentId}/review`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!data.all?.length && <tr><td colSpan={8} className="muted">No action items yet. They are created when an assessment is approved.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </Shell>
    </AuthGate>
  );
}
