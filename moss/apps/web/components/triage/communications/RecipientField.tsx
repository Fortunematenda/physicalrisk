'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  extractEmailFromChip,
  formatRecipientChip,
  isValidEmail,
  parseRecipientList,
} from './email-composer-utils';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  chipName?: string;
  showCcBcc?: boolean;
  onToggleCc?: () => void;
  onToggleBcc?: () => void;
  autoFocus?: boolean;
};

function RecipientChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#e8f0fe] px-2.5 py-0.5 text-[13px] text-[#174ea6]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="rounded-full p-0.5 hover:bg-[#d2e3fc]"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

export function RecipientField({
  label,
  value,
  onChange,
  placeholder,
  chipName,
  showCcBcc,
  onToggleCc,
  onToggleBcc,
  autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!value);

  const recipients = parseRecipientList(value);
  const hasSingleChip = recipients.length === 1 && isValidEmail(extractEmailFromChip(recipients[0]));

  function commitInput(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      setEditing(true);
      return;
    }
    if (chipName && isValidEmail(trimmed)) {
      onChange(formatRecipientChip(chipName, trimmed));
      setEditing(false);
      return;
    }
    onChange(trimmed);
    if (parseRecipientList(trimmed).every((r) => isValidEmail(extractEmailFromChip(r)))) {
      setEditing(false);
    }
  }

  return (
    <div className="flex items-start border-b border-[#eceff1] px-4 py-[9px] sm:px-5">
      <span className="shrink-0 pt-0.5 text-[14px] leading-none text-[#5f6368]">{label}</span>
      <div className="ml-2 min-w-0 flex-1">
        {!editing && hasSingleChip ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <RecipientChip
              label={recipients[0]}
              onRemove={() => {
                onChange('');
                setEditing(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            />
            <button
              type="button"
              className="text-[13px] text-[#5f6368] hover:underline"
              onClick={() => {
                setEditing(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Edit
            </button>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="email-composer-subject w-full border-0 bg-transparent p-0 text-[14px] text-[#202124] outline-none placeholder:text-[#70757a] focus:border-0 focus:outline-none focus:ring-0 focus:shadow-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => commitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInput(value);
              }
            }}
          />
        )}
      </div>
      {showCcBcc ? (
        <div className="ml-3 flex shrink-0 gap-3 pt-0.5 text-[13px] text-[#5f6368]">
          <button type="button" className="hover:text-[#202124] hover:underline" onClick={onToggleCc}>
            Cc
          </button>
          <button type="button" className="hover:text-[#202124] hover:underline" onClick={onToggleBcc}>
            Bcc
          </button>
        </div>
      ) : null}
    </div>
  );
}
