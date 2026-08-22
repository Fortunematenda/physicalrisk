'use client';

import { splitOptionPresentation } from '@/lib/scl-option-label';

type OptionProps = {
  selected: boolean;
  label: string;
  description?: string;
  onSelect: () => void;
  name?: string;
};

export function AssessmentResponseOption({ selected, label, description, onSelect, name = 'answer' }: OptionProps) {
  const parsed = description === undefined ? splitOptionPresentation(label) : { title: label, description: description || '' };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`scl-exec-option${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <span className="scl-exec-radio" aria-hidden="true" />
      <span className="scl-exec-option-copy">
        <strong>{parsed.title}</strong>
        {parsed.description ? <span>{parsed.description}</span> : null}
      </span>
      <input type="radio" name={name} checked={selected} readOnly tabIndex={-1} className="sr-only" />
    </button>
  );
}

type RangeProps = {
  options: Array<{ key: string; label: string; description?: string }>;
  value: string | null | undefined;
  onChange: (key: string) => void;
};

export function AssessmentRangeOption({ options, value, onChange }: RangeProps) {
  return (
    <div className="scl-exec-options scl-exec-options-grid" role="radiogroup">
      {options.map((o) => (
        <AssessmentResponseOption
          key={o.key}
          selected={value === o.key}
          label={o.label}
          description={o.description}
          onSelect={() => onChange(o.key)}
        />
      ))}
    </div>
  );
}
