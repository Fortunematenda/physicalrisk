'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onFormat: (before: string, after: string) => void;
  onPrefixLines: (prefix: string) => void;
  onRemoveFormatting: () => void;
  className?: string;
};

function FormatButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded p-1.5 text-[#444746] hover:bg-[#f1f3f4]',
        pressed && 'bg-[#f1f3f4]',
      )}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function FormattingToolbar({ onFormat, onPrefixLines, onRemoveFormatting, className }: Props) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-0.5 border-b border-[#eceff1] px-3 py-1', className)}>
      <FormatButton label="Bold" onClick={() => onFormat('**', '**')}>
        <Bold className="size-4" />
      </FormatButton>
      <FormatButton label="Italic" onClick={() => onFormat('_', '_')}>
        <Italic className="size-4" />
      </FormatButton>
      <FormatButton label="Underline" onClick={() => onFormat('<u>', '</u>')}>
        <Underline className="size-4" />
      </FormatButton>
      <span className="mx-1 h-5 w-px bg-[#dadce0]" aria-hidden="true" />
      <FormatButton label="Align left" onClick={() => onPrefixLines('')}>
        <AlignLeft className="size-4" />
      </FormatButton>
      <FormatButton label="Align center" onClick={() => onPrefixLines('')}>
        <AlignCenter className="size-4" />
      </FormatButton>
      <FormatButton label="Align right" onClick={() => onPrefixLines('')}>
        <AlignRight className="size-4" />
      </FormatButton>
      <span className="mx-1 h-5 w-px bg-[#dadce0]" aria-hidden="true" />
      <FormatButton label="Numbered list" onClick={() => onPrefixLines('1. ')}>
        <ListOrdered className="size-4" />
      </FormatButton>
      <FormatButton label="Bullet list" onClick={() => onPrefixLines('• ')}>
        <List className="size-4" />
      </FormatButton>
      <FormatButton label="Remove formatting" onClick={onRemoveFormatting}>
        <RemoveFormatting className="size-4" />
      </FormatButton>
    </div>
  );
}
