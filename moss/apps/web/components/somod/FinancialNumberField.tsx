'use client';

import { useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  currencySymbol,
  formatAmount,
  parseAmountInput,
  stepAmount,
  type SetupFieldDef,
} from '../../lib/somod-financial';

type Props = {
  field: SetupFieldDef;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  disabled?: boolean;
  /** Inline validation message; shown once the field is touched or a save was attempted. */
  error?: string | null;
};

export function FinancialNumberField({ field, value, onChange, currency, disabled, error }: Props) {
  const [focused, setFocused] = useState(false);
  const id = `somod-${field.key}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const parsed = parseAmountInput(value);
  const display =
    focused || parsed === null || parsed === '' ? value : formatAmount(Number(parsed), field.kind);
  const stepLabel = field.kind === 'money' ? `${currencySymbol(currency)} ${formatAmount(field.step, 'number')}` : String(field.step);

  function step(direction: 1 | -1) {
    onChange(stepAmount(field, value, direction));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.key === 'ArrowUp' ? 1 : -1);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          className="inline-flex w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => step(-1)}
          disabled={disabled}
          aria-label={`Decrease ${field.label} by ${stepLabel}`}
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <div className="relative min-w-0 flex-1">
          {field.kind === 'money' ? (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-slate-500">
              {currencySymbol(currency)}
            </span>
          ) : null}
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required={field.required}
            disabled={disabled}
            value={display}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            className={cn(
              'tabular-nums',
              field.kind === 'money' && (currencySymbol(currency).length > 1 ? 'pl-12' : 'pl-8'),
              error && 'border-[#c41230] focus-visible:ring-[#c41230]/30',
            )}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const normalized = parseAmountInput(value);
              if (normalized !== null && normalized !== value) onChange(normalized);
            }}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <button
          type="button"
          className="inline-flex w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => step(1)}
          disabled={disabled}
          aria-label={`Increase ${field.label} by ${stepLabel}`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p id={helpId} className="m-0 text-xs text-slate-500">
        {field.kind === 'money' ? `${currency} · ` : ''}
        {field.unit}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="m-0 text-xs font-medium text-[#c41230]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
