'use client';

import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RichTextEditor, plainTextToHtml } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { isRichTextEmpty, sanitizeRichText } from '@moss/shared';

export function RichTextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  required,
  showError,
  disabled,
  placeholder,
  minHeightClassName = 'min-h-[110px]',
  className,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  required?: boolean;
  showError?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minHeightClassName?: string;
  className?: string;
}) {
  const errorId = id ? `${id}-error` : undefined;
  const empty = isRichTextEmpty(value);
  const invalid = Boolean(showError && required && empty);

  return (
    <div className={cn('space-y-1.5', className)} onBlur={onBlur}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-[#c41230]"> *</span> : null}
      </Label>
      <RichTextEditor
        value={plainTextToHtml(value) || value}
        onChange={(html) => onChange(sanitizeRichText(html))}
        placeholder={placeholder}
        disabled={disabled}
        minHeightClassName={minHeightClassName}
        className={cn(invalid && 'border-amber-400 focus-within:ring-amber-400')}
      />
      {invalid ? (
        <p
          id={errorId}
          className="m-0 inline-flex items-center gap-1 text-xs font-medium text-amber-800"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {label} is required.
        </p>
      ) : null}
    </div>
  );
}
