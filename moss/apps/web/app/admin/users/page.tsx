'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import {
  CreateUserDialog,
  USER_ROLES,
  createdUserNotice,
  grantableRoles,
  userProvisioning,
  type CreatedUser,
  type UserAdminCapabilities,
} from '@/components/users/CreateUserDialog';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RowActionsMenu } from '../../../components/RowActionsMenu';
import {
  IconMoreVertical,
  IconPlus,
  IconRotateCcw,
  IconSearch,
} from '../../../components/NavIcons';
import { ExternalLink } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { safeExternalNavUrl } from '../../../lib/navigation';
import { platformRoleInfo, summariseResponsibilities } from '../../../lib/role-catalogue';

type AdminUser = CreatedUser & {
  lastLoginAt?: string | null;
  createdAt?: string;
  memberships?: Array<{ organisation?: { id: string; name: string } }>;
  assignmentsHeld?: Array<{ role: string; assessmentId: string }>;
};

type Capabilities = UserAdminCapabilities;

export default function UsersAdminPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    systemRole: 'ANALYST',
    isActive: true,
  });
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const provisioning = userProvisioning(capabilities);
  const canManage = provisioning !== null;
  const viaKeycloak = provisioning === 'keycloak';
  const assignable = grantableRoles(capabilities);
  const identityAdminUrl = safeExternalNavUrl(capabilities?.identityAdminUrl);
  const keycloakOnly = (u: AdminUser) => viaKeycloak && u.systemRole === 'SUPER_ADMIN';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, caps] = await Promise.all([
        apiFetch<AdminUser[]>('/admin/users'),
        apiFetch<Capabilities>('/admin/users/capabilities').catch(() => ({
          keycloakEnabled: true,
          legacyLoginEnabled: false,
          localUserAdmin: false,
        })),
      ]);
      setUsers(list);
      setCapabilities(caps);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.systemRole !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (!needle) return true;
      return [u.firstName, u.lastName, u.email, u.systemRole]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [users, query, roleFilter, statusFilter]);

  function openEdit(user: AdminUser) {
    setEditing(user);
    setEditForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      systemRole: user.systemRole || 'ANALYST',
      isActive: Boolean(user.isActive),
    });
    setError('');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      toast({ variant: 'success', title: 'User updated', description: editing.email });
      setEditing(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: AdminUser) {
    const next = !user.isActive;
    const ok = await confirm({
      title: next ? 'Activate user' : 'Deactivate user',
      description: `${next ? 'Activate' : 'Deactivate'} “${user.firstName} ${user.lastName}” (${user.email})?`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'default' : 'destructive',
    });
    if (!ok) return;
    setError('');
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      });
      toast({ variant: 'success', title: next ? 'User activated' : 'User deactivated', description: user.email });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update user status.');
    }
  }

  async function sendPasswordEmail(user: AdminUser) {
    const ok = await confirm({
      title: 'Send password email',
      description: `Email ${user.email} a link to choose a new password? Their current password keeps working until they do.`,
      confirmLabel: 'Send email',
    });
    if (!ok) return;
    setError('');
    try {
      await apiFetch(`/admin/users/${user.id}/password-email`, { method: 'POST' });
      toast({ variant: 'success', title: 'Password email sent', description: user.email });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send the password email.');
    }
  }

  async function deleteUser(user: AdminUser) {
    const ok = await confirm({
      title: 'Delete user',
      description: viaKeycloak
        ? `Delete “${user.firstName} ${user.lastName}” (${user.email})? Their Keycloak sign-in account is deleted too, so they can no longer sign in. Their past work stays in MOSS.`
        : `Delete “${user.firstName} ${user.lastName}” (${user.email})? They can no longer sign in. Their past work stays in MOSS.`,
      confirmLabel: 'Delete user',
      variant: 'destructive',
    });
    if (!ok) return;
    setError('');
    try {
      const result = await apiFetch<{ keycloakAccount?: string }>(`/admin/users/${user.id}`, { method: 'DELETE' });
      toast({
        variant: 'success',
        title: 'User deleted',
        description:
          result?.keycloakAccount === 'not_found'
            ? `${user.email} had no Keycloak account, so they were removed from MOSS only.`
            : user.email,
      });
      await load();
    } catch (err: unknown) {
      toast({
        variant: 'error',
        title: 'Could not delete user',
        description: err instanceof Error ? err.message : 'Unable to delete the user.',
      });
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordUser) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/users/${passwordUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      toast({ variant: 'success', title: 'Password reset', description: passwordUser.email });
      setPasswordUser(null);
      setNewPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <Shell
        title="User administration"
        hideEyebrow
        subtitle="Platform users, their effective roles, and engagement responsibilities."
      >
        {error && <p className="error">{error}</p>}
        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={() => void load()} disabled={loading}>
            <IconRotateCcw />
            Refresh
          </button>
          {canManage ? (
            <button type="button" className="btn org2-add-btn" onClick={() => setCreateOpen(true)}>
              <IconPlus />
              Add user
            </button>
          ) : null}
          {canManage && !viaKeycloak ? null : identityAdminUrl ? (
            <a
              className={viaKeycloak ? 'btn secondary' : 'btn org2-add-btn'}
              href={identityAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Manage users in the Keycloak admin console (opens in a new tab)"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {viaKeycloak ? 'Open Keycloak' : 'Manage users in Keycloak'}
            </a>
          ) : capabilities?.keycloakEnabled && !viaKeycloak ? (
            <span className="muted small">Keycloak admin console URL not configured (KEYCLOAK_ADMIN_CONSOLE_URL).</span>
          ) : null}
        </div>
        {viaKeycloak ? (
          <p className="muted small">
            Adding or editing users here updates their Keycloak sign-in account. New users get an email to set their own
            password. Administrators are managed in Keycloak.
          </p>
        ) : null}

        <section className="dash2-card org2-filters-card">
          <div className="assess2-filters">
            <label className="org2-filter-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users…"
                aria-label="Search users"
              />
            </label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Platform role">
              <option value="">All roles</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {platformRoleInfo(role).label}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              className="dash2-filter-btn"
              onClick={() => {
                setQuery('');
                setRoleFilter('');
                setStatusFilter('');
              }}
            >
              <IconRotateCcw />
              Clear
            </button>
          </div>
        </section>

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="assess2-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Platform role (effective)</th>
                  <th>Engagement responsibilities</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>
                        {u.firstName} {u.lastName}
                      </strong>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <strong>{platformRoleInfo(u.systemRole).label}</strong>
                      <span className="muted small" style={{ display: 'block' }}>
                        {platformRoleInfo(u.systemRole).description}
                      </span>
                      {platformRoleInfo(u.systemRole).keycloakRole ? (
                        <span className="muted small" style={{ display: 'block' }}>
                          Keycloak: {platformRoleInfo(u.systemRole).keycloakRole}
                        </span>
                      ) : null}
                    </td>
                    <td className="muted small">{summariseResponsibilities(u.assignmentsHeld) || '—'}</td>
                    <td>
                      <StatusBadge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td className="muted">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-ZA') : '—'}
                    </td>
                    <td className="org2-actions-cell">
                      {canManage && keycloakOnly(u) ? (
                        <RowActionsMenu
                          open={menuOpenId === u.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label={`Actions for ${u.email}`}
                              title="Administrators are managed in Keycloak"
                              onClick={() => setMenuOpenId((id) => (id === u.id ? null : u.id))}
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              void deleteUser(u);
                            }}
                          >
                            Delete
                          </button>
                        </RowActionsMenu>
                      ) : canManage ? (
                        <RowActionsMenu
                          open={menuOpenId === u.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label={`Actions for ${u.email}`}
                              onClick={() => setMenuOpenId((id) => (id === u.id ? null : u.id))}
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              openEdit(u);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              if (viaKeycloak) {
                                void sendPasswordEmail(u);
                                return;
                              }
                              setPasswordUser(u);
                              setNewPassword('');
                              setError('');
                            }}
                          >
                            {viaKeycloak ? 'Send password email' : 'Reset password'}
                          </button>
                          <button
                            type="button"
                            className={u.isActive ? 'danger' : undefined}
                            onClick={() => {
                              setMenuOpenId(null);
                              void toggleActive(u);
                            }}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              void deleteUser(u);
                            }}
                          >
                            Delete
                          </button>
                        </RowActionsMenu>
                      ) : (
                        <span className="muted small">{keycloakOnly(u) ? 'Managed in Keycloak' : 'SSO managed'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No users match the current filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="muted">
                      Loading users…
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
          allowedRoles={assignable}
          onCreated={(user) => {
            toast(createdUserNotice(user));
            void load();
          }}
        />

        <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-lg z-[12000]">
            <DialogHeader>
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription>{editing?.email}</DialogDescription>
            </DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="form-grid">
                <div className="field">
                  <label>First name</label>
                  <input
                    required
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input
                    required
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select
                    value={editForm.systemRole}
                    onChange={(e) => setEditForm({ ...editForm, systemRole: e.target.value })}
                    disabled={busy}
                  >
                    {editing && !assignable.includes(editing.systemRole as (typeof USER_ROLES)[number]) ? (
                      <option value={editing.systemRole} disabled>
                        {platformRoleInfo(editing.systemRole).label} (current)
                      </option>
                    ) : null}
                    {assignable.map((role) => (
                      <option key={role} value={role}>
                        {platformRoleInfo(role).label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select
                    value={editForm.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}
                    disabled={busy}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(passwordUser)} onOpenChange={(open) => !open && setPasswordUser(null)}>
          <DialogContent className="sm:max-w-md z-[12000]">
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for {passwordUser?.firstName} {passwordUser?.lastName} ({passwordUser?.email}).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={resetPassword} className="space-y-4">
              <div className="field">
                <label>New password</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </div>
              <DialogFooter>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => setPasswordUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Reset password'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
