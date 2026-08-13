import { describe, expect, it } from 'vitest';
import {
  defaultUnconfiguredMossScoringConfig,
  evaluateMossScores,
  isUnconfigured,
  publishedMeanMossScoringConfig,
} from '@moss/shared';

describe('MOSS API scoring integration contract', () => {
  it('sentinel draft remains UNCONFIGURED for audit history', () => {
    const cfg = defaultUnconfiguredMossScoringConfig();
    expect(isUnconfigured(cfg)).toBe(true);
    expect(cfg.domainAggregation).toBe('UNCONFIGURED');
    expect(cfg.overallAggregation).toBe('UNCONFIGURED');
  });

  it('published MEAN v1 is the live methodology after client confirmation', () => {
    const cfg = publishedMeanMossScoringConfig();
    expect(isUnconfigured(cfg)).toBe(false);
    const result = evaluateMossScores(
      [
        { controlCode: 'GOV-01', domainCode: 'D01', assessorScore: 2, status: 'SCORED' },
        { controlCode: 'GOV-02', domainCode: 'D01', assessorScore: 4, status: 'SCORED' },
        { controlCode: 'DEP-01', domainCode: 'D04', assessorScore: 1, status: 'SCORED' },
      ],
      cfg,
    );
    expect(result.configurationStatus).toBe('CONFIGURED');
    expect(result.domainScores.find((d) => d.domainCode === 'D01')?.score).toBe(3);
    expect(result.overallScore).toBe(2);
  });

  it('evaluate without published config still supports PENDING_METHODOLOGY', () => {
    const result = evaluateMossScores([
      { controlCode: 'GOV-01', domainCode: 'D01', assessorScore: 2, status: 'SCORED' },
      { controlCode: 'DEP-02', domainCode: 'D04', assessorScore: null, status: 'NOT_STARTED' },
    ]);
    expect(result.configurationStatus).toBe('PENDING_METHODOLOGY');
    expect(result.overallScore).toBeNull();
    expect(result.domainScores.every((d) => d.score === null)).toBe(true);
    expect(result.completenessPercent).toBe(50);
  });
});
