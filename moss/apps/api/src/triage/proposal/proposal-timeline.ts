import type { ProposalTimelineRow } from './proposal-template-types';

export type TimelineValidationIssue = {
  message: string;
  rowIndex?: number;
};

/** Normalize and clamp Gantt rows to absolute startWeek/endWeek (1-based, inclusive). */
export function normalizeTimelineRows(
  rows: Array<Partial<ProposalTimelineRow> & { name?: string }>,
  estimatedProjectWeeks?: number | null,
): ProposalTimelineRow[] {
  const cap = Math.max(1, Number(estimatedProjectWeeks) || 0);
  return (rows || [])
    .map((row, idx) => {
      const name = String(row.name || '').trim();
      let startWeek = Math.floor(Number(row.startWeek) || 0);
      let endWeek = Math.floor(Number(row.endWeek) || 0);
      if (!Number.isFinite(startWeek) || startWeek < 1) startWeek = 1;
      if (!Number.isFinite(endWeek) || endWeek < 1) endWeek = startWeek;
      if (endWeek < startWeek) endWeek = startWeek;
      if (cap > 0) {
        startWeek = Math.min(startWeek, cap);
        endWeek = Math.min(endWeek, cap);
        if (endWeek < startWeek) endWeek = startWeek;
      }
      return {
        name,
        startWeek,
        endWeek,
        sequence: Number(row.sequence) || idx + 1,
      };
    })
    .filter((row) => row.name.length > 0);
}

export function validateTimelineRows(
  rows: Array<Partial<ProposalTimelineRow> & { name?: string }>,
  estimatedProjectWeeks?: number | null,
): TimelineValidationIssue[] {
  const issues: TimelineValidationIssue[] = [];
  const weeks = Number(estimatedProjectWeeks);
  const hasCap = Number.isFinite(weeks) && weeks > 0;

  (rows || []).forEach((row, idx) => {
    const name = String(row.name || '').trim();
    if (!name) return;
    const startWeek = Math.floor(Number(row.startWeek) || 0);
    const endWeek = Math.floor(Number(row.endWeek) || 0);
    if (startWeek < 1) {
      issues.push({
        rowIndex: idx,
        message: `Gantt row "${name}": Start week must be at least 1.`,
      });
    }
    if (endWeek < startWeek) {
      issues.push({
        rowIndex: idx,
        message: `Gantt row "${name}": End week must be greater than or equal to Start week.`,
      });
    }
    if (hasCap && endWeek > weeks) {
      issues.push({
        rowIndex: idx,
        message: `Gantt row "${name}": End week cannot exceed estimated project weeks (${weeks}).`,
      });
    }
    if (hasCap && startWeek > weeks) {
      issues.push({
        rowIndex: idx,
        message: `Gantt row "${name}": Start week cannot exceed estimated project weeks (${weeks}).`,
      });
    }
  });

  return issues;
}

/** Week columns for the PDF Gantt — cover the full estimated span and any later end week. */
export function resolveGanttMaxWeeks(
  rows: ProposalTimelineRow[],
  estimatedProjectWeeks?: number | null,
): number {
  const fromRows = rows.length ? Math.max(...rows.map((r) => r.endWeek)) : 0;
  return Math.max(1, Number(estimatedProjectWeeks) || 0, fromRows);
}
