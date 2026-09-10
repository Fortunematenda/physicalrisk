import { describe, expect, it } from 'vitest';
import {
  normalizeTimelineRows,
  resolveGanttMaxWeeks,
  validateTimelineRows,
} from './proposal-timeline';

describe('proposal timeline / gantt', () => {
  it('validates start/end weeks', () => {
    const issues = validateTimelineRows(
      [
        { name: 'A', startWeek: 1, endWeek: 2 },
        { name: 'B', startWeek: 5, endWeek: 3 },
      ],
      6,
    );
    expect(issues.some((i) => i.message.includes('End week must be greater'))).toBe(true);
  });

  it('rejects weeks beyond estimated project weeks', () => {
    const issues = validateTimelineRows(
      [{ name: 'A', startWeek: 1, endWeek: 8 }],
      6,
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('normalizes inverted end weeks and resolves max columns', () => {
    const rows = normalizeTimelineRows(
      [
        { name: 'A', startWeek: 1, endWeek: 2, sequence: 1 },
        { name: 'B', startWeek: 2, endWeek: 3, sequence: 2 },
        { name: 'C', startWeek: 3, endWeek: 4, sequence: 3 },
      ],
      6,
    );
    expect(rows).toHaveLength(3);
    expect(resolveGanttMaxWeeks(rows, 6)).toBe(6);
    expect(rows[0]).toMatchObject({ startWeek: 1, endWeek: 2 });
  });
});
