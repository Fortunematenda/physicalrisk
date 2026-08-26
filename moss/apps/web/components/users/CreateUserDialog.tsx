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

export const USER_ROLES = [
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'CLIENT_EXECUTIVE',
  'CLIENT_CONTRIBUTOR',
  'AUDITOR',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type CreatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  systemRole: string;
  isActive: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  defaultRole = 'ANALYST',
  allowedRoles,
  title = 'Add user',
  description = 'Create a local platform user. They can sign in with email and password when legacy login is enabled.',
  onCreated,
}: Props) {
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
      const created = await apiFetch<CreatedUser>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(form),
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
          <DialogDescription>{description}</DialogDescription>
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
            <div className="space-y-2">
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
                      {role.replaceAll('_', ' ')}
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
