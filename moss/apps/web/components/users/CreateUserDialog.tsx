'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { platformRoleInfo } from '@/lib/role-catalogue';
import {
  USER_ROLES,
  type CreatedUser,
  type UserProvisioning,
  type UserRole,
} from '@/lib/user-admin';

export {
  USER_ROLES,
  createdUserNotice,
  grantableRoles,
  userProvisioning,
  type CreatedUser,
  type UserAdminCapabilities,
  type UserProvisioning,
  type UserRole,
} from '@/lib/user-admin';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keycloak: no password field; Keycloak emails the user to set one. */
  provisioning?: UserProvisioning;
  /** Defaults to ANALYST (for triage “Add analyst”). */
  defaultRole?: UserRole;
  /** Restrict selectable roles (e.g. analyst-only picker). */
  allowedRoles?: UserRole[];
  title?: string;
  description?: string;
  onCreated?: (user: CreatedUser) => void;
};

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  systemRole: 'ANALYST' as UserRole,
};

export function CreateUserDialog({
  open,
  onOpenChange,
  provisioning = 'local',
  defaultRole = 'ANALYST',
  allowedRoles,
  title = 'Add user',
  description,
  onCreated,
}: Props) {
  const viaKeycloak = provisioning === 'keycloak';
  const intro =
    description ||
    (viaKeycloak
      ? 'Creates their sign-in account. They will get an email to set their own password.'
      : 'Create a local platform user. They can sign in with email and password when legacy login is enabled.');
  const roles = allowedRoles?.length ? allowedRoles : [...USER_ROLES];
  const [form, setForm] = useState({ ...emptyForm, systemRole: defaultRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, systemRole: roles.includes(defaultRole) ? defaultRole : roles[0] });
    setError('');
    setBusy(false);
  }, [open, defaultRole, roles.join('|')]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { password, ...rest } = form;
      const created = await apiFetch<CreatedUser>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(viaKeycloak ? rest : { ...rest, password }),
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[12000] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error ? <p className="error">{error}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-user-first">First name</Label>
              <Input
                id="create-user-first"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-last">Last name</Label>
              <Input
                id="create-user-last"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                disabled={busy}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={busy}
              />
            </div>
            {viaKeycloak ? null : (
              <div className="space-y-2">
                <Label htmlFor="create-user-password">Password</Label>
                <Input
                  id="create-user-password"
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </div>
            )}
            <div className={viaKeycloak ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
              <Label>Role</Label>
              <Select
                value={form.systemRole}
                onValueChange={(next) => setForm({ ...form, systemRole: next as UserRole })}
                disabled={busy || roles.length === 1}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[13000]">
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {platformRoleInfo(role).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
