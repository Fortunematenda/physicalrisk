'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const ADD_NEW_VALUE = '__add_new_industry__';

type IndustrySelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Called when the catalogue list is refreshed (e.g. for list filters). */
  onCatalogueChange?: (industries: string[]) => void;
};

export function IndustrySelect({
  id = 'org-industry',
  value,
  onChange,
  disabled,
  onCatalogueChange,
}: IndustrySelectProps) {
  const [industries, setIndustries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const applyList = useCallback(
    (list: string[]) => {
      setIndustries(list);
      onCatalogueChange?.(list);
    },
    [onCatalogueChange],
  );

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<{ industries: string[] }>('/organisations/industries')
      .then((res) => applyList(res.industries || []))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unable to load industries.');
      })
      .finally(() => setLoading(false));
  }, [applyList]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep a legacy/free-text industry visible even if not yet in the catalogue.
  const options =
    value && !industries.some((item) => item.toLowerCase() === value.toLowerCase())
      ? [...industries, value].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      : industries;

  async function saveNewIndustry() {
    const name = draft.trim();
    if (name.length < 2) {
      setError('Industry name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch<{ industry: string; industries: string[] }>('/organisations/industries', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      applyList(res.industries || []);
      onChange(res.industry);
      setDraft('');
      setMode('select');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to add industry.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'add') {
    return (
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={id}
            autoFocus
            disabled={disabled || saving}
            value={draft}
            placeholder="New industry name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void saveNewIndustry();
              }
              if (e.key === 'Escape') {
                setMode('select');
                setDraft('');
                setError('');
              }
            }}
            className="flex h-10 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="btn"
              disabled={disabled || saving}
              onClick={() => void saveNewIndustry()}
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={saving}
              onClick={() => {
                setMode('select');
                setDraft('');
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
        {error ? <p className="error mb-0 text-xs">{error}</p> : null}
        <p className="mb-0 text-xs text-slate-500">Adds this industry to the system catalogue for reuse.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        id={id}
        disabled={disabled || loading}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === ADD_NEW_VALUE) {
            setError('');
            setDraft('');
            setMode('add');
            return;
          }
          onChange(next);
        }}
        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{loading ? 'Loading industries…' : 'Select industry'}</option>
        {options.map((industry) => (
          <option key={industry} value={industry}>
            {industry}
          </option>
        ))}
        <option value={ADD_NEW_VALUE}>+ Add new…</option>
      </select>
      {error ? <p className="error mb-0 text-xs">{error}</p> : null}
    </div>
  );
}
