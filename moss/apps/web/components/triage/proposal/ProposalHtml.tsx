'use client';

import { cn } from '@/lib/utils';
import { looksLikeHtml, sanitizeProposalHtml, stripHtmlToPlain } from '@/lib/proposal-html';

type Props = {
  value?: string | number | null;
  empty?: string;
  className?: string;
  /** Clamp long previews (e.g. introduction card). */
  clampLines?: number;
};

/**
 * Renders proposal rich-text HTML safely, or plain text for legacy values.
 */
export function ProposalHtml({
  value,
  empty = 'Not completed',
  className,
  clampLines,
}: Props) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) {
    return <span className={cn('text-amber-700/90', className)}>{empty}</span>;
  }

  if (!looksLikeHtml(raw)) {
    return (
      <span
        className={cn(
          'whitespace-pre-wrap text-slate-800',
          clampLines === 3 && 'line-clamp-3',
          className,
        )}
      >
        {raw}
      </span>
    );
  }

  const plain = stripHtmlToPlain(raw);
  if (!plain) {
    return <span className={cn('text-amber-700/90', className)}>{empty}</span>;
  }

  return (
    <div
      className={cn(
        'proposal-html text-slate-800',
        '[&_p]:m-0 [&_p]:mb-1.5 [&_p:last-child]:mb-0',
        '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-0.5',
        '[&_strong]:font-semibold [&_b]:font-semibold',
        '[&_em]:italic [&_i]:italic [&_u]:underline',
        clampLines === 3 && 'line-clamp-3',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeProposalHtml(raw) }}
    />
  );
}
