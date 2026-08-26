'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { IconPlus } from '../../../components/NavIcons';
import { apiFetch } from '../../../lib/api';
import { getStoredUser, resolveMvpNavRole } from '../../../lib/auth-user';

type AnalystRow = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  systemRole: string;
};

export default function Consultants() {
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';
  const [rows, setRows] = useState<AnalystRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [localUserAdmin, setLocalUserAdmin] = useState(true);

  async function load() {
    try {
      const [list, caps] = await Promise.all([
        apiFetch<AnalystRow[]>('/admin/users/analysts'),
        apiFetch<{ localUserAdmin?: boolean }>('/admin/users/capabilities').catch(() => ({
          localUserAdmin: true,
        })),
      ]);
      setRows(list);
      setLocalUserAdmin(caps.localUserAdmin !== false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load consultants.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AuthGate>
      <Shell title="Consultants & Analysts" hideEyebrow subtitle="Resources available for Level 2 and Level 3 assignment.">
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {!localUserAdmin && isAdmin ? (
          <p className="notice" style={{ marginBottom: 16 }}>
            Local user create is disabled while SSO is exclusive. Enable legacy login, or create analysts in Keycloak /
            User administration.
          </p>
        ) : null}
        <div className="org2-actions-row">
          <Link className="btn secondary" href="/admin/users">
            Open user administration
          </Link>
          {isAdmin ? (
            <button type="button" className="btn org2-add-btn" onClick={() => setCreateOpen(true)}>
              <IconPlus />
              Add analyst
            </button>
          ) : null}
        </div>
        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="assess2-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Available for assignment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {r.firstName} {r.lastName}
                      </strong>
                    </td>
                    <td>{r.email}</td>
                    <td>{r.systemRole.replaceAll('_', ' ')}</td>
                    <td>Yes</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No analysts available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultRole="ANALYST"
          allowedRoles={['ANALYST', 'REVIEWER']}
          title="Add analyst"
          description="Create an analyst or reviewer who can be assigned to triage and advisory engagements."
          onCreated={() => {
            setNotice('Analyst created.');
            setError('');
            void load();
          }}
        />
      </Shell>
    </AuthGate>
  );
}
