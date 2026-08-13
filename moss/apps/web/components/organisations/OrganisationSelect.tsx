'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { IndustrySelect } from '@/components/organisations/IndustrySelect';

const ADD_NEW_VALUE = '__add_new_organisation__';

export type OrgOption = { id: string; name: string };

type OrganisationSelectProps = {
  id?: string;
  value: string;
  onChange: (organisationId: string, org?: OrgOption) => void;
  organisations?: OrgOption[];
  onOrganisationsChange?: (orgs: OrgOption[]) => void;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
};

export function OrganisationSelect({
  id = 'organisation-select',
  value,
  onChange,
  organisations: controlledOrgs,
  onOrganisationsChange,
  required,
  disabled,
  emptyLabel = 'Select organisation',
}: OrganisationSelectProps) {
  const [orgs, setOrgs] = useState<OrgOption[]>(controlledOrgs || []);
  const [loading, setLoading] = useState(!controlledOrgs);
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const applyOrgs = useCallback(
    (list: OrgOption[]) => {
      setOrgs(list);
      onOrganisationsChange?.(list);
    },
    [onOrganisationsChange],
  );

  useEffect(() => {
    if (controlledOrgs) {
      setOrgs(controlledOrgs);
      setLoading(false);
    }
  }, [controlledOrgs]);

  useEffect(() => {
    if (controlledOrgs) return;
    setLoading(true);
    apiFetch<OrgOption[]>('/organisations')
      .then((list) => applyOrgs(list.map((o) => ({ id: o.id, name: o.name }))))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unable to load organisations.');
      })
      .finally(() => setLoading(false));
  }, [controlledOrgs, applyOrgs]);

  async function saveNewOrganisation() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Organisation name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<OrgOption>('/organisations', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          industry: industry.trim() || undefined,
        }),
      });
      const next = [...orgs.filter((o) => o.id !== created.id), { id: created.id, name: created.name }]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      applyOrgs(next);
      onChange(created.id, created);
      setName('');
      setIndustry('');
      setMode('select');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to create organisation.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'add') {
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <div className="space-y-2">
          <label htmlFor={`${id}-name`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Organisation name *
          </label>
          <input
            id={`${id}-name`}
            autoFocus
            disabled={disabled || saving}
            value={name}
            placeholder="New organisation name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setMode('select');
                setError('');
              }
            }}
            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-industry`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Industry
          </label>
          <IndustrySelect
            id={`${id}-industry`}
            value={industry}
            onChange={setIndustry}
            disabled={disabled || saving}
          />
        </div>
        {error ? <p className="error mb-0 text-xs">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={disabled || saving} onClick={() => void saveNewOrganisation()}>
            {saving ? 'Adding…' : 'Add organisation'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={saving}
            onClick={() => {
              setMode('select');
              setName('');
              setIndustry('');
              setError('');
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        id={id}
        required={required}
        disabled={disabled || loading}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === ADD_NEW_VALUE) {
            setError('');
            setName('');
            setIndustry('');
            setMode('add');
            return;
          }
          const org = orgs.find((o) => o.id === next);
          onChange(next, org);
        }}
        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{loading ? 'Loading organisations…' : emptyLabel}</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value={ADD_NEW_VALUE}>+ Add new…</option>
      </select>
      {error ? <p className="error mb-0 text-xs">{error}</p> : null}
    </div>
  );
}
