'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { apiFetch } from '@/lib/api';
import { platformRoleInfo } from '@/lib/role-catalogue';

type Person = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  systemRole: string;
};

type CatalogueItem = {
  key: string;
  label: string;
  description: string;
  eligibleSystemRoles: string[];
  singleHolder: boolean;
};

type ResponsibilitiesResponse = {
  catalogue: CatalogueItem[];
  canManage: boolean;
  holders: Array<{ user: Person; responsibilities: string[] }>;
  candidates: Array<Person & { eligible: string[] }>;
};

function personName(p: Person) {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
}

export function EngagementResponsibilitiesCard({
  engagementId,
  onChanged,
}: {
  engagementId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [data, setData] = useState<ResponsibilitiesResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [extraPeople, setExtraPeople] = useState<string[]>([]);
  const [addPersonId, setAddPersonId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const next = await apiFetch<ResponsibilitiesResponse>(`/advisory/${engagementId}/responsibilities`);
    setData(next);
    setDrafts(Object.fromEntries(next.holders.map((h) => [h.user.id, [...h.responsibilities]])));
    setExtraPeople([]);
  }, [engagementId]);

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unable to load responsibilities.'));
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const holderIds = new Set(data.holders.map((h) => h.user.id));
    const extra = extraPeople
      .filter((id) => !holderIds.has(id))
      .map((id) => data.candidates.find((c) => c.id === id))
      .filter(Boolean) as Person[];
    return [...data.holders.map((h) => ({ user: h.user, saved: h.responsibilities })), ...extra.map((user) => ({ user, saved: [] as string[] }))];
  }, [data, extraPeople]);

  if (!data && !error) {
    return null;
  }

  const catalogue = data?.catalogue || [];
  const canManage = Boolean(data?.canManage);
  const addable = (data?.candidates || []).filter((c) => !rows.some((r) => r.user.id === c.id));

  function eligible(person: Person, item: CatalogueItem) {
    return item.eligibleSystemRoles.includes(person.systemRole);
  }

  function toggle(personId: string, key: string, checked: boolean) {
    setDrafts((prev) => {
      const current = new Set(prev[personId] || []);
      if (checked) current.add(key);
      else current.delete(key);
      return { ...prev, [personId]: [...current] };
    });
  }

  async function save(person: Person) {
    setSavingId(person.id);
    setError('');
    setNotice('');
    try {
      const next = await apiFetch<ResponsibilitiesResponse>(
        `/advisory/${engagementId}/responsibilities/${person.id}`,
        { method: 'PUT', body: JSON.stringify({ responsibilities: drafts[person.id] || [] }) },
      );
      setData(next);
      setDrafts(Object.fromEntries(next.holders.map((h) => [h.user.id, [...h.responsibilities]])));
      setExtraPeople([]);
      setNotice(`Responsibilities updated for ${personName(person)}.`);
      await onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to update responsibilities.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Engagement responsibilities</CardTitle>
        <CardDescription>
          Who is responsible for what on this engagement. One person can hold several responsibilities.
          Responsibilities do not change platform access: reviewing and approving still need the Senior Reviewer or
          Administrator platform role (managed in Keycloak).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="error" role="alert">{error}</p> : null}
        {notice ? <p className="notice" role="status">{notice}</p> : null}

        <div className="overflow-x-auto">
          <table className="assess2-table min-w-[640px]">
            <caption className="sr-only">Engagement responsibilities by person</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {catalogue.map((item) => (
                  <th key={item.key} scope="col" title={item.description}>
                    {item.label}
                  </th>
                ))}
                {canManage ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user, saved }) => {
                const draft = drafts[user.id] || [];
                const dirty = [...draft].sort().join('|') !== [...saved].sort().join('|');
                const name = personName(user);
                return (
                  <tr key={user.id}>
                    <th scope="row" className="text-left font-normal">
                      <strong className="block text-sm">{name}</strong>
                      <span className="muted small">{platformRoleInfo(user.systemRole).label}</span>
                    </th>
                    {catalogue.map((item) => {
                      const isEligible = eligible(user, item);
                      const checked = draft.includes(item.key);
                      // A lead can be moved to someone else, but not removed outright.
                      const lockedLead = item.singleHolder && saved.includes(item.key);
                      const disabled = !canManage || !isEligible || lockedLead || savingId === user.id;
                      return (
                        <td key={item.key}>
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(value) => toggle(user.id, item.key, value === true)}
                            aria-label={`${item.label} for ${name}`}
                            title={
                              !isEligible
                                ? `${item.label} requires: ${item.eligibleSystemRoles.map((r) => platformRoleInfo(r).label).join(', ')}`
                                : lockedLead
                                  ? 'Assign the engagement lead to another person to change it'
                                  : item.description
                            }
                          />
                        </td>
                      );
                    })}
                    {canManage ? (
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant={dirty ? 'default' : 'outline'}
                          disabled={!dirty || savingId === user.id}
                          onClick={() => void save(user)}
                        >
                          {savingId === user.id ? 'Saving…' : 'Save'}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={catalogue.length + (canManage ? 2 : 1)} className="muted">
                    No responsibilities assigned yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {canManage && addable.length ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`add-responsible-${engagementId}`}>Add a person</label>
              <select
                id={`add-responsible-${engagementId}`}
                value={addPersonId}
                onChange={(e) => setAddPersonId(e.target.value)}
              >
                <option value="">Select analyst or reviewer…</option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {personName(c)} · {platformRoleInfo(c.systemRole).label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!addPersonId}
              onClick={() => {
                setExtraPeople((prev) => [...prev, addPersonId]);
                setDrafts((prev) => ({ ...prev, [addPersonId]: prev[addPersonId] || [] }));
                setAddPersonId('');
              }}
            >
              Add to table
            </Button>
          </div>
        ) : null}

        <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
          {catalogue.map((item) => (
            <div key={item.key}>
              <dt className="font-semibold text-slate-800">{item.label}</dt>
              <dd className="m-0">{item.description}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
