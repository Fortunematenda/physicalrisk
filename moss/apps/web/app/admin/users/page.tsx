'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { CreateUserDialog, USER_ROLES, type CreatedUser } from '@/components/users/CreateUserDialog';
import { useConfirm } from '@/components/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IconPlus,
  IconRotateCcw,
  IconSearch,
} from '../../../components/NavIcons';
import { apiFetch } from '../../../lib/api';

type AdminUser = CreatedUser & {
  lastLoginAt?: string | null;
  createdAt?: string;
  memberships?: Array<{ organisation?: { id: string; name: string } }>;
};

type Capabilities = {
  keycloakEnabled: boolean;
  legacyLoginEnabled: boolean;
  localUserAdmin: boolean;
};

export default function UsersAdminPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
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

  const canManage = Boolean(capabilities?.localUserAdmin);

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
    setNotice('');
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
      setNotice('User updated.');
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
      setNotice(next ? 'User activated.' : 'User deactivated.');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update user status.');
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
      setNotice(`Password reset for ${passwordUser.email}.`);
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
        subtitle="Create and manage platform users, roles, and access status."
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {capabilities?.keycloakEnabled ? (
          <p className="notice" style={{ marginBottom: 16 }}>
            <strong>SSO is enabled.</strong>
            {capabilities.localUserAdmin
              ? ' Legacy login is also on — you can create and edit local users here. Keycloak accounts still sync on SSO sign-in.'
              : ' Manage accounts and roles in Keycloak. Local create/edit is disabled while legacy login is off.'}
          </p>
        ) : null}

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
        </div>

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
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role">
              <option value="">All roles</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll('_', ' ')}
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
                  <th>Role</th>
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
                    <td>{u.systemRole.replaceAll('_', ' ')}</td>
                    <td>
                      <StatusBadge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td className="muted">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-ZA') : '—'}
                    </td>
                    <td className="org2-actions-cell">
                      {canManage ? (
                        <div className="triage-admin-actions">
                          <button type="button" className="btn secondary" onClick={() => openEdit(u)}>
                            Edit
                          </button>
                          <button type="button" className="btn secondary" onClick={() => {
                            setPasswordUser(u);
                            setNewPassword('');
                            setError('');
                          }}>
                            Reset password
                          </button>
                          <button type="button" className="btn secondary" onClick={() => void toggleActive(u)}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      ) : (
                        <span className="muted small">SSO managed</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && !filtered.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No users match the current filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="muted">
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
          onCreated={() => {
            setNotice('User created.');
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
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll('_', ' ')}
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
