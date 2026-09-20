'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  current: string;
  root?: boolean;
};

/** Matches triage / advisory breadcrumb chrome for Cost Leakage pages. */
export function CostLeakageBreadcrumb({ current, root = false }: Props) {
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
        href="/assessments"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="Back to Security Cost Leakage"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <Link
        href="/assessments"
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        Security Cost Leakage
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <span className="truncate font-semibold text-slate-900">{current}</span>
    </nav>
  );
}
