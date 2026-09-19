'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type AdvisoryBreadcrumbProps = {
  /** Current page label (last crumb). */
  current: string;
  /** Where the back chevron returns. Defaults to Diagnostics & assurance list. */
  backHref?: string;
  backLabel?: string;
  /**
   * List root (`/advisory`): section title only — no back control.
   * Nested pages: back › Executive Advisory › Diagnostics & assurance › current.
   */
  root?: boolean;
};

/**
 * Matches triage detail breadcrumb on nested pages.
 * The Diagnostics & assurance list is the Executive Advisory home — no back from there.
 */
export function AdvisoryBreadcrumb({
  current,
  backHref = '/advisory',
  backLabel = 'Back to diagnostics & assurance',
  root = false,
}: AdvisoryBreadcrumbProps) {
  if (root) {
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        <span className="truncate font-semibold text-slate-900">{current}</span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={backHref}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label={backLabel}
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
      <Link
        href="/advisory"
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        Diagnostics &amp; assurance
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <span className="truncate font-semibold text-slate-900">{current}</span>
    </nav>
  );
}
