'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EmptyState } from './empty-state';
import { Loading } from './loading';
import { PageHeader } from './page-header';
import { StatusBadge } from './status-badge';

type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'json';
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  defaultValue?: unknown;
};

export function SimpleCrud({
  title,
  description,
  endpoint,
  fields,
  columns,
}: {
  title: string;
  description: string;
  endpoint: string;
  fields: Field[];
  columns: Array<{ key: string; label: string; render?: (item: any) => React.ReactNode }>;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, any>>(() => Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? (field.type === 'checkbox' ? true : '')])));

  const load = async () => {
    setLoading(true);
    try { setItems(await api(endpoint)); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load records'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [endpoint]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const payload = { ...form };
      for (const field of fields) {
        if (field.type === 'number') payload[field.key] = Number(payload[field.key]);
        if (field.type === 'json' && typeof payload[field.key] === 'string') payload[field.key] = payload[field.key].trim() ? JSON.parse(payload[field.key]) : [];
      }
      await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setMessage(`${title.replace(/s$/, '')} created successfully.`);
      setForm(Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? (field.type === 'checkbox' ? true : '')])));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save record'); }
    finally { setSaving(false); }
  };

  return <>
    <PageHeader title={title} description={description}/>
    <div className="grid two">
      <form className="form-card" onSubmit={submit}>
        <div className="form-section"><h2>Add new</h2><p>Create another configurable record without changing application code.</p>
          <div className="form-grid">
            {fields.map((field) => <div className={`field ${field.type === 'textarea' || field.type === 'json' ? 'full' : ''}`} key={field.key}>
              {field.type === 'checkbox' ? <label className="checkbox"><input type="checkbox" checked={Boolean(form[field.key])} onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}/>{field.label}</label> : <>
                <label>{field.label}{field.required && <em> *</em>}</label>
                {field.type === 'textarea' || field.type === 'json' ? <textarea required={field.required} placeholder={field.placeholder} value={String(form[field.key] ?? '')} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}/> : field.type === 'select' ? <select required={field.required} value={String(form[field.key] ?? '')} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}><option value="">Select…</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === 'number' ? 'number' : 'text'} required={field.required} placeholder={field.placeholder} value={String(form[field.key] ?? '')} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}/>} 
              </>}
            </div>)}
          </div>
        </div>
        {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Create record'}</button></div>
      </form>
      <div className="panel">
        <div className="panel-header"><h2>Configured records</h2><button className="button small" onClick={() => void load()}>Refresh</button></div>
        {loading ? <Loading/> : items.length === 0 ? <EmptyState title="No records" text="Create the first configuration record."/> : <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(item) : column.key === 'active' ? <StatusBadge value={item.active ? 'ACTIVE' : 'INACTIVE'}/> : typeof item[column.key] === 'object' ? <span className="mono">{JSON.stringify(item[column.key])}</span> : String(item[column.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
      </div>
    </div>
  </>;
}
