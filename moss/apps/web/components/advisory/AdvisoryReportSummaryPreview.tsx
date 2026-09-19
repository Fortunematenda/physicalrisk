'use client';

import { useMemo } from 'react';
import {
  buildEadExecutiveNarrative,
  buildEadReportSummary,
  type EadReportModuleInput,
} from '@moss/shared';
import { cn } from '@/lib/utils';

/**
 * Executive Outcome blocks for the diagnostic outcome page.
 * Scoring/recommendation logic stays in buildEadReportSummary — presentation only.
 */
export function AdvisoryReportSummaryPreview({
  modules,
  recommendationCount,
  variant = 'full',
}: {
  modules: EadReportModuleInput[];
  /** When set, show a one-line recommendation count instead of listing products. */
  recommendationCount?: number;
  /** `hero` = score + narrative + not-aware only (for two-column top). */
  variant?: 'full' | 'hero' | 'scorecard' | 'priority';
}) {
  const summary = useMemo(() => buildEadReportSummary({ modules }), [modules]);
  const narrative = useMemo(
    () =>
      buildEadExecutiveNarrative(summary.moduleScores, summary.overallAssuranceScore, summary.notAwareCount, {
        includeNotAware: false,
      }),
    [summary],
  );

  if (variant === 'hero') {
    return (
      <ExecutiveOutcomeHero
        overall={summary.overallAssuranceScore}
        bandLabel={summary.overallBand?.displayLabel}
        colourHex={summary.overallVisual?.colourHex}
        narrative={narrative}
        notAwareCount={summary.notAwareCount}
        recommendationCount={recommendationCount}
      />
    );
  }

  if (variant === 'scorecard') {
    return <ModuleScorecard rows={summary.moduleScores} />;
  }

  if (variant === 'priority') {
    return <PriorityAttention areas={summary.priorityAreas} />;
  }

  return (
    <div className="space-y-5">
      <ExecutiveOutcomeHero
        overall={summary.overallAssuranceScore}
        bandLabel={summary.overallBand?.displayLabel}
        colourHex={summary.overallVisual?.colourHex}
        narrative={narrative}
        notAwareCount={summary.notAwareCount}
        recommendationCount={recommendationCount}
      />
      <ModuleScorecard rows={summary.moduleScores} />
      <PriorityAttention areas={summary.priorityAreas} />
    </div>
  );
}

function ExecutiveOutcomeHero({
  overall,
  bandLabel,
  colourHex,
  narrative,
  notAwareCount,
  recommendationCount,
}: {
  overall: number | null;
  bandLabel?: string;
  colourHex?: string;
  narrative: string;
  notAwareCount: number;
  recommendationCount?: number;
}) {
  return (
    <div className="space-y-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Executive Outcome
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="m-0 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {overall == null ? '—' : `${overall} / 100`}
        </p>
        {bandLabel ? (
          <p
            className="m-0 text-sm font-semibold"
            style={{ color: colourHex || '#111827' }}
          >
            {bandLabel}
          </p>
        ) : null}
      </div>
      <p className="m-0 text-sm leading-relaxed text-slate-700">{narrative}</p>
      {notAwareCount > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <p className="m-0 text-xs font-semibold text-slate-800">Knowledge visibility gap</p>
          <p className="m-0 mt-0.5 text-sm font-medium text-slate-900">
            {notAwareCount} criteria marked &ldquo;Not aware&rdquo;
          </p>
          <p className="m-0 mt-1 text-xs text-slate-500">
            These responses indicate areas where control operation could not be confirmed.
          </p>
        </div>
      ) : null}
      {typeof recommendationCount === 'number' && recommendationCount > 0 ? (
        <p className="m-0 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{recommendationCount}</span>
          {' '}
          focused assurance engagement{recommendationCount === 1 ? '' : 's'} recommended
        </p>
      ) : null}
    </div>
  );
}

function ModuleScorecard({
  rows,
}: {
  rows: Array<{
    moduleCode: string;
    moduleName: string;
    assuranceScore: number | null;
    band?: { displayLabel: string } | null;
    visual?: { colourHex?: string } | null;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Module scorecard
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold sm:px-5">Diagnostic area</th>
              <th className="px-3 py-2.5 font-semibold tabular-nums">Score</th>
              <th className="px-4 py-2.5 font-semibold sm:px-5">Assurance status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.moduleCode} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 text-slate-800 sm:px-5">{row.moduleName}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">
                  {row.assuranceScore == null ? '—' : `${row.assuranceScore} / 100`}
                </td>
                <td className="px-4 py-2.5 sm:px-5">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: row.visual?.colourHex || '#64748b' }}
                  >
                    {row.band?.displayLabel || 'Not scored'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriorityAttention({
  areas,
}: {
  areas: Array<{
    moduleCode: string;
    moduleName: string;
    assuranceScore: number;
    band: { displayLabel: string };
    visual?: { colourHex?: string };
  }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Priority executive attention
      </p>
      {areas.length ? (
        <ol className="m-0 mt-3 list-none space-y-3 p-0">
          {areas.map((p, index) => (
            <li key={p.moduleCode} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="m-0 text-sm font-semibold text-slate-900">{p.moduleName}</p>
                  <p className="m-0 text-sm tabular-nums text-slate-600">{p.assuranceScore} / 100</p>
                </div>
                <p
                  className={cn('m-0 mt-0.5 text-xs font-semibold')}
                  style={{ color: p.visual?.colourHex || '#64748b' }}
                >
                  {p.band.displayLabel}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 mt-2 text-sm text-slate-500">
          No diagnostic areas currently fall within the high-concern threshold.
        </p>
      )}
    </div>
  );
}
