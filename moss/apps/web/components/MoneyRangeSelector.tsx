'use client';

import {
  SCL_MONEY_RANGES,
  buildMoneyRangeValue,
  formatMoneyRangeSelection,
  isMoneyRangeValue,
  type MoneyRangeCode,
  type MoneyRangeValue,
} from '@moss/shared';

import { cn } from '@/lib/utils';

type Props = {
  id?: string;
  value: unknown;
  onChange: (next: MoneyRangeValue) => void;
  disabled?: boolean;
};

function selectedCode(value: unknown): MoneyRangeCode | '' {
  if (isMoneyRangeValue(value)) return value.code;
  return '';
}

export function MoneyRangeSelector({ id, value, onChange, disabled }: Props) {
  const selected = selectedCode(value);
  const caption = formatMoneyRangeSelection(value) || 'Estimated losses: not selected';

  return (
    <div className="money-range" id={id}>
      <p className="money-range-caption" aria-live="polite">
        {caption}
      </p>
      <div className="money-range-track" role="radiogroup" aria-label="Estimated ZAR loss range">
        {SCL_MONEY_RANGES.map((band) => {
          const active = selected === band.code;
          return (
            <button
              key={band.code}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              className={cn('money-range-band', active && 'selected')}
              onClick={() => onChange(buildMoneyRangeValue(band.code))}
            >
              <span className="money-range-band-label">{band.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
