'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  EAD_RECOMMENDED_PRODUCT_OPTIONS,
  recommendedProductLabel,
  type EadRoutingProductCode,
} from '@moss/shared';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type RecommendedProductsValue = EadRoutingProductCode[];

function snapshotKey(codes: RecommendedProductsValue) {
  return codes.join('|');
}

export function RecommendedProductsSelector({
  id,
  value,
  disabled,
  legacyShield360,
  onChange,
  onBlur,
}: {
  id?: string;
  value: RecommendedProductsValue;
  disabled?: boolean;
  /** Historical Shield 360 still stored on the module — show correction hint. */
  legacyShield360?: boolean;
  onChange: (next: RecommendedProductsValue) => void;
  onBlur?: () => void;
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<RecommendedProductsValue>(value);
  const lastEmittedKey = useRef(snapshotKey(value));

  useEffect(() => {
    const incoming = snapshotKey(value);
    if (incoming === lastEmittedKey.current) return;
    lastEmittedKey.current = incoming;
    setLocal(value);
  }, [value]);

  function emit(next: RecommendedProductsValue) {
    lastEmittedKey.current = snapshotKey(next);
    setLocal(next);
    onChange(next);
  }

  function toggleCode(code: EadRoutingProductCode) {
    if (disabled) return;
    const checked = local.includes(code);
    emit(checked ? local.filter((c) => c !== code) : [...local, code]);
  }

  function removeCode(code: EadRoutingProductCode) {
    if (disabled || !local.includes(code)) return;
    emit(local.filter((c) => c !== code));
    onBlur?.();
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <Label id={`${fieldId}-label`}>Recommended next products</Label>

      {legacyShield360 ? (
        <p className="m-0 text-xs text-amber-800">
          This module previously recommended Shield 360 (retired). Select a replacement or leave
          empty — Shield 360 cannot be re-selected.
        </p>
      ) : null}

      {local.length ? (
        <div className="flex flex-wrap gap-2">
          {local.map((code) => {
            const label = recommendedProductLabel(code);
            return (
              <span
                key={code}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <span className="truncate">{label}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                    aria-label={`Remove ${label} recommendation`}
                    onClick={() => removeCode(code)}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-xs text-slate-500">No focused product selected</p>
      )}

      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            id={`${fieldId}-trigger`}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9 gap-1.5"
            aria-labelledby={`${fieldId}-label`}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Plus className="size-3.5" />
            Add recommendation
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(100vw-2rem,26rem)] p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
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
            {EAD_RECOMMENDED_PRODUCT_OPTIONS.map((opt) => {
              const checked = local.includes(opt.code);
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
    </div>
  );
}
