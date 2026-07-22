'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { apiFetch } from '../../../lib/api';
import { isSsoEnabled } from '../../../lib/sso';

const ROLES = [
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'CLIENT_EXECUTIVE',
  'CLIENT_CONTRIBUTOR',
  'AUDITOR',
];

export default function UsersAdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ssoOn, setSsoOn] = useState(true);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    systemRole: 'ANALYST',
  });

  const load = () => apiFetch('/admin/users').then(setUsers).catch((e) => setError(e.message));

  useEffect(() => {
    void isSsoEnabled().then(setSsoOn);
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setNotice('User created.');
      setForm({ email: '', password: '', firstName: '', lastName: '', systemRole: 'ANALYST' });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleActive(user: any) {
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <AuthGate>
      <Shell title="User administration">
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {ssoOn ? (
          <p className="notice" style={{ marginBottom: 16 }}>
            <strong>SSO is enabled.</strong> Users are provisioned from Keycloak when they sign in.
            Manage accounts and roles in <code>auth.physicalrisk.com</code> — local create/edit is disabled.
          </p>
        ) : null}

        <div className={ssoOn ? 'grid' : 'grid two-col'}>
          <section className="card">
            <h2>{ssoOn ? 'SSO users (synced)' : 'Users'}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last login</th>
                    {!ssoOn ? <th></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>
                          {u.firstName} {u.lastName}
                        </strong>
                      </td>
                      <td>{u.email}</td>
                      <td>{u.systemRole}</td>
                      <td>
                        <StatusBadge value={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td>
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-ZA') : '—'}
                      </td>
                      {!ssoOn ? (
                        <td>
                          <button className="btn secondary" onClick={() => toggleActive(u)}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Role aliases: SUPER_ADMIN = System admin · REVIEWER = Senior reviewer · SALES = Sales
              user
            </p>
          </section>

          {!ssoOn ? (
            <form className="card" onSubmit={create}>
              <h2>Create user</h2>
              <div className="form-grid">
                <div className="field">
                  <label>First name</label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select
                    value={form.systemRole}
                    onChange={(e) => setForm({ ...form, systemRole: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn" style={{ marginTop: 14 }}>
                Create user
              </button>
            </form>
          ) : null}
        </div>
      </Shell>
    </AuthGate>
  );
}
