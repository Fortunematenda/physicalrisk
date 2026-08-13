'use client';

import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';

type WorkspaceDomain = {
  domainCode: string;
  name: string;
  controls: Array<{
    controlCode: string;
    name: string;
  }>;
};

type ControlOption = {
  controlCode: string;
  name: string;
  domainCode: string;
  domainName: string;
};

type MossControlCodeSelectProps = {
  assessmentId: string;
  value: string;
  onChange: (controlCode: string) => void;
  id?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function MossControlCodeSelect({
  assessmentId,
  value,
  onChange,
  id,
  required = false,
  allowEmpty = false,
  emptyLabel = 'Select control code',
  disabled = false,
  className,
}: MossControlCodeSelectProps) {
  const [options, setOptions] = useState<ControlOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!assessmentId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const data = await apiFetch<{ domains?: WorkspaceDomain[] }>(
          `/moss/assessments/${assessmentId}`,
        );
        if (cancelled) return;
        const next = (data.domains || []).flatMap((domain) =>
          (domain.controls || []).map((control) => ({
            controlCode: control.controlCode,
            name: control.name,
            domainCode: domain.domainCode,
            domainName: domain.name,
          })),
        );
        setOptions(next);
      } catch {
        if (!cancelled) {
          setOptions([]);
          setLoadError('Unable to load control codes.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { domainCode: string; domainName: string; controls: ControlOption[] }>();
    for (const option of options) {
      const key = option.domainCode;
      const existing = map.get(key);
      if (existing) {
        existing.controls.push(option);
      } else {
        map.set(key, {
          domainCode: option.domainCode,
          domainName: option.domainName,
          controls: [option],
        });
      }
    }
    return [...map.values()];
  }, [options]);

  return (
    <div className="space-y-1">
      <select
        id={id}
        value={value}
        required={required && !allowEmpty}
        disabled={disabled || loading || Boolean(loadError)}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ||
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        }
      >
        <option value="">
          {loading ? 'Loading controls…' : loadError || emptyLabel}
        </option>
        {grouped.map((group) => (
          <optgroup key={group.domainCode} label={`${group.domainCode} — ${group.domainName}`}>
            {group.controls.map((control) => (
              <option key={control.controlCode} value={control.controlCode}>
                {control.controlCode} — {control.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {loadError ? <p className="text-xs text-red-600">{loadError}</p> : null}
    </div>
  );
}
