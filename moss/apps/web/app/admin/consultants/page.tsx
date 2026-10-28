'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { IconPlus } from '../../../components/NavIcons';
import { ExternalLink } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { getStoredUser, resolveMvpNavRole } from '../../../lib/auth-user';
import { safeExternalNavUrl } from '../../../lib/navigation';
import { platformRoleInfo } from '../../../lib/role-catalogue';

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
  // Assume SSO-managed until capabilities load, so "Add analyst" never flashes when it cannot work.
  const [localUserAdmin, setLocalUserAdmin] = useState(false);
  const [identityAdminUrl, setIdentityAdminUrl] = useState<string | null>(null);

  async function load() {
    try {
      const [list, caps] = await Promise.all([
        apiFetch<AnalystRow[]>('/admin/users/analysts'),
        apiFetch<{ localUserAdmin?: boolean; identityAdminUrl?: string | null }>('/admin/users/capabilities').catch(
          () => ({ localUserAdmin: false, identityAdminUrl: null }),
        ),
      ]);
      setRows(list);
      setLocalUserAdmin(caps.localUserAdmin === true);
      setIdentityAdminUrl(safeExternalNavUrl(caps.identityAdminUrl));
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
            Analysts and reviewers sign in through Keycloak SSO. To add one, create the person in Keycloak and assign
            the <strong>moss_analyst</strong> or <strong>moss_reviewer</strong> realm role; they appear here after their
            first sign-in. Engagement responsibilities are then assigned on each engagement.
          </p>
        ) : null}
        <div className="org2-actions-row">
          <Link className="btn secondary" href="/admin/users">
            Open user administration
          </Link>
          {isAdmin && localUserAdmin ? (
            <button type="button" className="btn org2-add-btn" onClick={() => setCreateOpen(true)}>
              <IconPlus />
              Add analyst
            </button>
          ) : null}
          {isAdmin && !localUserAdmin && identityAdminUrl ? (
            <a
              className="btn org2-add-btn"
              href={identityAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Add analyst in the Keycloak admin console (opens in a new tab)"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Add analyst in Keycloak
            </a>
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
                    <td>{platformRoleInfo(r.systemRole).label}</td>
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
