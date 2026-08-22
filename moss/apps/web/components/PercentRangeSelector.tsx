'use client';

import {
  SCL_PERCENT_RANGES,
  buildPercentRangeValue,
  formatPercentRangeSelection,
  isPercentRangeValue,
  type PercentRangeCode,
  type PercentRangeValue,
} from '@moss/shared';

import { cn } from '@/lib/utils';

type Props = {
  id?: string;
  value: unknown;
  onChange: (next: PercentRangeValue) => void;
  disabled?: boolean;
};

function selectedCode(value: unknown): PercentRangeCode | '' {
  if (isPercentRangeValue(value)) return value.rangeCode;
  return '';
}

/** Compact chip text for dense calibration rows (full label stays on title/aria). */
function compactBandLabel(label: string): string {
  return label.replace(/%/g, '');
}

export function PercentRangeSelector({ id, value, onChange, disabled }: Props) {
  const selected = selectedCode(value);
  const selection = formatPercentRangeSelection(value);

  return (
    <div className="percent-range" id={id}>
      <p className="percent-range-caption" aria-live="polite">
        {selection ? (
          <>
            Selected: <strong>{selection.replace(/^Estimated percentage:\s*/i, '')}</strong>
          </>
        ) : (
          'Not selected'
        )}
      </p>
      <div className="percent-range-track" role="radiogroup" aria-label="Estimated percentage range">
        {SCL_PERCENT_RANGES.map((band) => {
          const active = selected === band.rangeCode;
          return (
            <button
              key={band.rangeCode}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={band.label}
              disabled={disabled}
              className={cn('percent-range-band', active && 'selected')}
              onClick={() => onChange(buildPercentRangeValue(band.rangeCode))}
              title={band.label}
            >
              <span className="percent-range-band-label">{compactBandLabel(band.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
