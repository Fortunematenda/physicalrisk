'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type AdvisoryBreadcrumbProps = {
  /** Current page label (last crumb). */
  current: string;
  /** Where the back chevron returns. */
  backHref?: string;
  backLabel?: string;
  /**
   * List root: Executive Advisory › Diagnostics & assurance (no middle list link).
   * Detail pages: Executive Advisory › Diagnostics & assurance › current.
   */
  root?: boolean;
};

/**
 * Matches triage detail breadcrumb: back chevron + section crumbs + current.
 */
export function AdvisoryBreadcrumb({
  current,
  backHref,
  backLabel,
  root = false,
}: AdvisoryBreadcrumbProps) {
  const href = backHref ?? (root ? '/dashboard' : '/advisory');
  const label =
    backLabel ?? (root ? 'Back to dashboard' : 'Back to diagnostics & assurance');

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={href}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label={label}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <Link
        href="/advisory"
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        Executive Advisory
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      {root ? (
        <span className="truncate font-semibold text-slate-900">{current}</span>
      ) : (
        <>
          <Link
            href="/advisory"
            className="font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            Diagnostics &amp; assurance
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="truncate font-semibold text-slate-900">{current}</span>
        </>
      )}
    </nav>
  );
}
