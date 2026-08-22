'use client';

import {
  isOtherIndustryLabel,
  resolveIndustrySelectState,
} from '@/lib/scl-industry-other';

type Props = {
  id?: string;
  options: string[];
  value: unknown;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Use choice pills (analyst UI) instead of a native select. */
  variant?: 'select' | 'pills';
  placeholder?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
};

export function IndustryWithOtherField({
  id,
  options,
  value,
  onChange,
  disabled,
  variant = 'select',
  placeholder = 'Select…',
  otherLabel = 'Please specify industry',
  otherPlaceholder = 'Enter industry name',
}: Props) {
  const state = resolveIndustrySelectState(value, options);
  const otherInputId = id ? `${id}-other` : undefined;

  function chooseOption(next: string) {
    if (isOtherIndustryLabel(next)) {
      // Keep existing custom text if the user re-opens Other.
      onChange(state.otherText.trim() || next);
      return;
    }
    onChange(next);
  }

  return (
    <div className="industry-with-other">
      {variant === 'pills' ? (
        <div className="choice-grid">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={disabled}
              className={`choice-pill${state.selectValue === o ? ' selected' : ''}`}
              onClick={() => chooseOption(o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <select
          id={id}
          className={`scl-exec-select${state.selectValue ? ' has-value' : ''}`}
          disabled={disabled}
          value={state.selectValue}
          onChange={(e) => chooseOption(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {state.showOther ? (
        <div className="industry-other-field">
          <label htmlFor={otherInputId} className="industry-other-label">
            {otherLabel}
          </label>
          <input
            id={otherInputId}
            type="text"
            disabled={disabled}
            value={state.otherText}
            placeholder={otherPlaceholder}
            autoComplete="organization-title"
            onChange={(e) => {
              const text = e.target.value;
              onChange(text.trim() ? text : (state.selectValue || 'Other'));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
