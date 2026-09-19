'use client';

import { buildEadReportSummary, type EadReportModuleInput } from '@moss/shared';
import { cn } from '@/lib/utils';

export function AdvisoryReportSummaryPreview({
  modules,
  salesEmail = 'sales@physicalrisk.com',
}: {
  modules: EadReportModuleInput[];
  salesEmail?: string;
}) {
  const summary = buildEadReportSummary({ modules });

  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Executive summary preview
        </p>
        <p className="m-0 mt-2 text-3xl font-semibold text-slate-900">
          {summary.overallAssuranceScore == null ? '—' : `${summary.overallAssuranceScore} / 100`}
        </p>
        {summary.overallBand ? (
          <p
            className="m-0 mt-1 text-sm font-semibold"
            style={{ color: summary.overallVisual?.colourHex || '#111827' }}
          >
            {summary.overallBand.displayLabel}
          </p>
        ) : null}
        <p className="m-0 mt-3 text-sm leading-relaxed text-slate-700">{summary.executiveNarrative}</p>
      </div>

      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Module scorecard
        </p>
        <div className="space-y-2">
          {summary.moduleScores.map((row) => (
            <div key={row.moduleCode} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
              <span className="text-slate-800">{row.moduleName}</span>
              <span className="tabular-nums text-slate-700">
                {row.assuranceScore == null ? '—' : `${row.assuranceScore}/100`}
              </span>
              <span
                className={cn('min-w-[9rem] text-right text-xs font-semibold')}
                style={{ color: row.visual?.colourHex || '#64748b' }}
              >
                {row.band?.displayLabel || 'Not scored'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Priority executive attention
        </p>
        {summary.priorityAreas.length ? (
          <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {summary.priorityAreas.map((p) => (
              <li key={p.moduleCode}>
                {p.moduleName} — {p.assuranceScore}/100 ({p.band.displayLabel})
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-slate-500">
            No diagnostic areas currently fall within the high-concern threshold.
          </p>
        )}
      </div>

      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Recommended next engagements
        </p>
        {summary.recommendations.length ? (
          <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {summary.recommendations.map((r) => (
              <li key={r.productCode}>
                <span className="font-medium text-slate-900">{r.label}</span>
                {r.sourceModules.length ? (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Recommended from:{' '}
                    {r.sourceModules.map((m) => m.moduleName).join('; ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-slate-500">
            No further Physical Risk product is currently recommended.
          </p>
        )}
        <p className="m-0 mt-3 text-sm text-slate-700">
          To discuss these findings:{' '}
          <a className="font-semibold text-[#c41230] underline" href={`mailto:${salesEmail}`}>
            {salesEmail}
          </a>
        </p>
      </div>
    </div>
  );
}
