'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Loading } from '@/components/loading';
import { api, formatDate } from '@/lib/api';
import { isSsoEnabled } from '@/lib/sso';

export default function UsersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ssoOn, setSsoOn] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'VIEWER' });

  const load = () => {
    setLoading(true);
    api('/users')
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void isSsoEnabled().then(setSsoOn);
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setMessage('User created.');
      setForm({ name: '', email: '', password: '', role: 'VIEWER' });
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create user');
    }
  };

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description={
          ssoOn
            ? 'Directory of SSO users synced from Keycloak. Create and edit accounts in Keycloak only.'
            : 'Control who may administer, import, review or view repository information.'
        }
      />

      {ssoOn ? (
        <div className="notice info" style={{ marginBottom: '1.25rem' }}>
          <strong>SSO is enabled.</strong> Users appear here automatically when they sign in via
          Keycloak. Manage names and roles in <code>auth.physicalrisk.com</code> — local user creation is
          disabled.
        </div>
      ) : null}

      <div className={ssoOn ? 'grid one' : 'grid two'}>
        {!ssoOn ? (
          <form className="form-card" onSubmit={submit}>
            <div className="form-section">
              <h2>Create local user</h2>
              <div className="form-grid">
                <div className="field">
                  <label>Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Temporary password</label>
                  <input
                    type="password"
                    minLength={8}
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option>ADMIN</option>
                    <option>IMPORTER</option>
                    <option>REVIEWER</option>
                    <option>VIEWER</option>
                  </select>
                </div>
              </div>
            </div>
            {error && <div className="notice error">{error}</div>}
            {message && <div className="notice success">{message}</div>}
            <div className="form-actions">
              <button className="button primary">Create user</button>
            </div>
          </form>
        ) : null}

        <div className="panel">
          <div className="panel-header">
            <h2>{ssoOn ? 'SSO users (synced)' : 'Local authorised users'}</h2>
          </div>
          {error && ssoOn ? <div className="notice error">{error}</div> : null}
          {loading ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="secondary-text">{item.email}</div>
                      </td>
                      <td>
                        <span className="badge">{item.role}</span>
                      </td>
                      <td>
                        <StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
