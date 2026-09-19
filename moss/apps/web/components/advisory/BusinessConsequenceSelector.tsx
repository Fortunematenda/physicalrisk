'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  EAD_BUSINESS_CONSEQUENCE_OPTIONS,
  businessConsequenceLabel,
  type EadBusinessConsequenceCode,
  validateBusinessConsequences,
} from '@moss/shared';
import { AlertCircle, Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RichTextEditor, plainTextToHtml } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { sanitizeRichText } from '@moss/shared';

export type BusinessConsequenceValue = {
  codes: EadBusinessConsequenceCode[];
  otherText: string;
  detail: string;
};

function snapshotKey(v: BusinessConsequenceValue) {
  return `${v.codes.join('|')}::${v.otherText}::${v.detail}`;
}

export function BusinessConsequenceSelector({
  id,
  value,
  disabled,
  showError,
  onChange,
  onBlur,
}: {
  id?: string;
  value: BusinessConsequenceValue;
  disabled?: boolean;
  showError?: boolean;
  onChange: (next: BusinessConsequenceValue) => void;
  onBlur?: () => void;
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [open, setOpen] = useState(false);
  /** Local UI state so parent autosave/re-renders do not flash the selection. */
  const [local, setLocal] = useState<BusinessConsequenceValue>(value);
  const lastEmittedKey = useRef(snapshotKey(value));

  useEffect(() => {
    const incoming = snapshotKey(value);
    if (incoming === lastEmittedKey.current) return;
    lastEmittedKey.current = incoming;
    setLocal(value);
  }, [value]);

  const validation = useMemo(
    () => validateBusinessConsequences(local.codes, local.otherText),
    [local.codes, local.otherText],
  );
  const showOther = local.codes.includes('OTHER');
  const invalid = Boolean(showError && !validation.ok);

  function emit(next: BusinessConsequenceValue) {
    lastEmittedKey.current = snapshotKey(next);
    setLocal(next);
    onChange(next);
  }

  function toggleCode(code: EadBusinessConsequenceCode) {
    if (disabled) return;
    const checked = local.codes.includes(code);
    const nextCodes = checked
      ? local.codes.filter((c) => c !== code)
      : [...local.codes, code];
    emit({
      ...local,
      codes: nextCodes,
      otherText: nextCodes.includes('OTHER') ? local.otherText : '',
    });
  }

  function removeCode(code: EadBusinessConsequenceCode) {
    if (disabled || !local.codes.includes(code)) return;
    emit({
      ...local,
      codes: local.codes.filter((c) => c !== code),
      otherText: code === 'OTHER' ? '' : local.otherText,
    });
    onBlur?.();
  }

  return (
    <div className="space-y-5 md:col-span-2">
      <div className="flex flex-col items-start gap-2">
        <Label id={`${fieldId}-label`} className="block">
          Business consequences
          <span className="text-[#c41230]"> *</span>
        </Label>

        {local.codes.length ? (
          <div className="flex w-full flex-wrap gap-2">
            {local.codes.map((code) => (
              <span
                key={code}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <span className="truncate">
                  {code === 'OTHER' && local.otherText.trim()
                    ? `Other: ${local.otherText.trim()}`
                    : businessConsequenceLabel(code)}
                </span>
                {!disabled ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                    aria-label={`Remove ${businessConsequenceLabel(code)}`}
                    onClick={() => removeCode(code)}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <Popover open={open} onOpenChange={setOpen} modal={false}>
          <PopoverTrigger asChild>
            <Button
              id={`${fieldId}-trigger`}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(
                'h-9 gap-1.5',
                invalid && 'border-amber-400 focus-visible:ring-amber-400',
              )}
              aria-labelledby={`${fieldId}-label`}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${fieldId}-error` : undefined}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <Plus className="size-3.5" />
              {local.codes.length ? 'Add consequence' : 'Select consequences'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(100vw-2rem,22rem)] p-2"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // Keep menu open while interacting with chips/remove buttons above.
              const target = e.target as HTMLElement | null;
              if (target?.closest(`[id="${fieldId}-trigger"]`)) e.preventDefault();
            }}
          >
            <div
              className="max-h-72 space-y-0.5 overflow-y-auto"
              role="listbox"
              aria-multiselectable="true"
              aria-labelledby={`${fieldId}-label`}
            >
              {EAD_BUSINESS_CONSEQUENCE_OPTIONS.map((opt) => {
                const checked = local.codes.includes(opt.code);
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    disabled={disabled}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-50',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleCode(opt.code)}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        checked
                          ? 'border-slate-800 bg-slate-800 text-white'
                          : 'border-slate-300 bg-white',
                      )}
                      aria-hidden="true"
                    >
                      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {invalid ? (
          <p
            id={`${fieldId}-error`}
            className="m-0 inline-flex items-center gap-1 text-xs font-medium text-amber-800"
          >
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            {validation.error}
          </p>
        ) : null}
      </div>

      {showOther ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-other`}>
            Other consequence
            <span className="text-[#c41230]"> *</span>
          </Label>
          <Input
            id={`${fieldId}-other`}
            disabled={disabled}
            value={local.otherText}
            placeholder="Enter consequence..."
            onChange={(e) => emit({ ...local, otherText: e.target.value })}
            onBlur={onBlur}
            className={cn(
              showError &&
                !local.otherText.trim() &&
                'border-amber-400 focus-visible:ring-amber-400',
            )}
          />
        </div>
      ) : null}

      <div className="space-y-2 pt-1">
        <Label htmlFor={`${fieldId}-detail`}>Consequence detail / context</Label>
        <RichTextEditor
          value={plainTextToHtml(local.detail) || local.detail}
          onChange={(html) => emit({ ...local, detail: sanitizeRichText(html) })}
          placeholder="Optional context explaining how the selected consequences arise..."
          disabled={disabled}
          minHeightClassName="min-h-[110px]"
        />
      </div>
    </div>
  );
}
