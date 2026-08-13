import { describe, expect, it } from 'vitest';
import {
  defaultUnconfiguredMossScoringConfig,
  effectiveControlScore,
  evaluateMossScores,
  formatMossScoreDisplay,
  isUnconfigured,
  publishedMeanMossScoringConfig,
  type MossScoringConfig,
} from './moss-scoring';

const sampleControls = [
  { controlCode: 'GOV-01', domainCode: 'D01', assessorScore: 2, status: 'SCORED' },
  { controlCode: 'GOV-02', domainCode: 'D01', assessorScore: 4, status: 'SCORED' },
  { controlCode: 'DEP-01', domainCode: 'D04', assessorScore: 1, status: 'SCORED' },
  { controlCode: 'DEP-02', domainCode: 'D04', assessorScore: null, status: 'NOT_STARTED' },
];

describe('MOSS scoring (independent of SCLI)', () => {
  it('resolves effective control score as finalScore then assessorScore', () => {
    expect(effectiveControlScore({ assessorScore: 2 })).toBe(2);
    expect(effectiveControlScore({ assessorScore: 2, finalScore: 3 })).toBe(3);
    expect(effectiveControlScore({})).toBeNull();
  });

  it('default sentinel config is UNCONFIGURED', () => {
    const cfg = defaultUnconfiguredMossScoringConfig();
    expect(cfg.domainAggregation).toBe('UNCONFIGURED');
    expect(cfg.overallAggregation).toBe('UNCONFIGURED');
    expect(isUnconfigured(cfg)).toBe(true);
  });

  it('published MEAN v1 config is configured', () => {
    const cfg = publishedMeanMossScoringConfig();
    expect(isUnconfigured(cfg)).toBe(false);
    expect(cfg.domainAggregation).toBe('MEAN');
    expect(cfg.overallAggregation).toBe('MEAN');
  });

  it('formatMossScoreDisplay respects configuration status', () => {
    expect(formatMossScoreDisplay(2.5, 'PENDING_METHODOLOGY')).toMatch(/Pending/);
    expect(formatMossScoreDisplay(2.5, 'CONFIGURED')).toBe('2.50');
    expect(formatMossScoreDisplay(3, 'CONFIGURED')).toBe('3');
    expect(formatMossScoreDisplay(null, 'CONFIGURED')).toBe('—');
  });

  it('unconfigured aggregation returns null domain/overall but still computes completeness', () => {
    const result = evaluateMossScores(sampleControls);
    expect(result.configurationStatus).toBe('PENDING_METHODOLOGY');
    expect(result.overallScore).toBeNull();
    expect(result.domainScores.every((d) => d.score === null)).toBe(true);
    expect(result.completenessPercent).toBe(75);
    expect(result.controlScores.find((c) => c.controlCode === 'GOV-01')?.score).toBe(2);
    expect(result.domainScores.find((d) => d.domainCode === 'D01')).toMatchObject({
      controlsScored: 2,
      controlsTotal: 2,
    });
  });

  it('draft published-looking config still pending if aggregation UNCONFIGURED', () => {
    const cfg: MossScoringConfig = {
      version: 'test',
      status: 'PUBLISHED',
      domainAggregation: 'UNCONFIGURED',
      overallAggregation: 'MEAN',
    };
    expect(isUnconfigured(cfg)).toBe(true);
    const result = evaluateMossScores(sampleControls, cfg);
    expect(result.overallScore).toBeNull();
  });

  it('synthetic MEAN config works in unit tests only', () => {
    const cfg: MossScoringConfig = {
      version: 'synthetic-mean',
      status: 'PUBLISHED',
      domainAggregation: 'MEAN',
      overallAggregation: 'MEAN',
    };
    const result = evaluateMossScores(sampleControls, cfg);
    expect(result.configurationStatus).toBe('CONFIGURED');
    expect(result.domainScores.find((d) => d.domainCode === 'D01')?.score).toBe(3);
    expect(result.domainScores.find((d) => d.domainCode === 'D04')?.score).toBe(1);
    // overall from domain means: (3+1)/2 = 2
    expect(result.overallScore).toBe(2);
  });

  it('synthetic WEIGHTED_MEAN uses domain weights', () => {
    const cfg: MossScoringConfig = {
      version: 'synthetic-weighted',
      status: 'PUBLISHED',
      domainAggregation: 'MEAN',
      overallAggregation: 'WEIGHTED_MEAN',
      domainWeights: { D01: 3, D04: 1 },
    };
    const result = evaluateMossScores(sampleControls, cfg);
    // domains: D01=3, D04=1 → (3*3 + 1*1) / 4 = 2.5
    expect(result.overallScore).toBe(2.5);
  });

  it('synthetic MIN uses minimum scored control/domain', () => {
    const cfg: MossScoringConfig = {
      version: 'synthetic-min',
      status: 'PUBLISHED',
      domainAggregation: 'MIN',
      overallAggregation: 'MIN',
    };
    const result = evaluateMossScores(sampleControls, cfg);
    expect(result.domainScores.find((d) => d.domainCode === 'D01')?.score).toBe(2);
    expect(result.overallScore).toBe(1);
  });

  it('does not invent scores for unscored controls', () => {
    const result = evaluateMossScores(sampleControls);
    expect(result.controlScores.find((c) => c.controlCode === 'DEP-02')?.score).toBeNull();
  });
});
