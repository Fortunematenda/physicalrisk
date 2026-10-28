'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import {
  CreateUserDialog,
  createdUserNotice,
  grantableRoles,
  userProvisioning,
  type UserAdminCapabilities,
  type UserProvisioning,
} from '@/components/users/CreateUserDialog';
import { useToast } from '@/components/ui/toast';
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  // Assume SSO-managed until capabilities load, so "Add analyst" never flashes when it cannot work.
  const [provisioning, setProvisioning] = useState<UserProvisioning | null>(null);
  const [caps, setCaps] = useState<UserAdminCapabilities | null>(null);
  const [identityAdminUrl, setIdentityAdminUrl] = useState<string | null>(null);
  const canAddUsers = provisioning !== null;

  async function load() {
    try {
      const [list, loadedCaps] = await Promise.all([
        apiFetch<AnalystRow[]>('/admin/users/analysts'),
        apiFetch<UserAdminCapabilities>('/admin/users/capabilities').catch(
          (): UserAdminCapabilities => ({ localUserAdmin: false, identityAdminUrl: null }),
        ),
      ]);
      setRows(list);
      setCaps(loadedCaps);
      setProvisioning(userProvisioning(loadedCaps));
      setIdentityAdminUrl(safeExternalNavUrl(loadedCaps.identityAdminUrl));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load consultants.');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AuthGate>
      <Shell title="Consultants & Analysts" hideEyebrow subtitle="Resources available for Level 2 and Level 3 assignment.">
        {error && <p className="error">{error}</p>}
        <div className="org2-actions-row">
          <Link className="btn secondary" href="/admin/users">
            Open user administration
          </Link>
          {isAdmin && canAddUsers ? (
            <button type="button" className="btn org2-add-btn" onClick={() => setCreateOpen(true)}>
              <IconPlus />
              Add analyst
            </button>
          ) : null}
          {isAdmin && !canAddUsers && identityAdminUrl ? (
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
                      {loaded ? 'No analysts available yet.' : 'Loading analysts…'}
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
          provisioning={provisioning ?? 'local'}
          defaultRole="ANALYST"
          allowedRoles={grantableRoles(caps, ['ANALYST', 'REVIEWER'])}
          title="Add analyst"
          description={
            provisioning === 'keycloak'
              ? 'Add an analyst or reviewer for triage and advisory engagements. They will get an email to set their own password.'
              : 'Create an analyst or reviewer who can be assigned to triage and advisory engagements.'
          }
          onCreated={(user) => {
            toast(createdUserNotice(user));
            setError('');
            void load();
          }}
        />
      </Shell>
    </AuthGate>
  );
}
