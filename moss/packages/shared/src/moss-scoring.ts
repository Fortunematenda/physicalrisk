/**
 * MOSS scoring engine — independent from SCLI scoring/leakage/opportunity.
 *
 * Live methodology (v1.0.0): unweighted MEAN for domain and overall scores,
 * per client confirmation of recommended defaults (2026-08-13).
 * Sentinel UNCONFIGURED draft may still exist for audit history.
 */

export type MossControlMaturityScore = 0 | 1 | 2 | 3 | 4;

export type MossAggregationMode = 'MEAN' | 'WEIGHTED_MEAN' | 'MIN' | 'UNCONFIGURED';

export type MossScoringConfigStatus = 'DRAFT' | 'PUBLISHED';

export interface MossScoringConfig {
  version: string;
  status: MossScoringConfigStatus;
  domainAggregation: MossAggregationMode;
  overallAggregation: MossAggregationMode;
  /** Domain code → weight (used only for WEIGHTED_MEAN). */
  domainWeights?: Record<string, number>;
  criticalControlPolicy?: unknown;
  severityMapping?: unknown;
  recommendationPolicy?: unknown;
}

export interface MossControlScoreInput {
  controlCode: string;
  domainCode: string;
  /** Preferred: finalScore → assessorScore → null */
  assessorScore?: number | null;
  finalScore?: number | null;
  status?: string | null;
}

export interface MossDomainScoreResult {
  domainCode: string;
  score: number | null;
  controlsScored: number;
  controlsTotal: number;
  completionPercent: number;
}

export interface MossControlScoreResult {
  controlCode: string;
  domainCode: string;
  score: number | null;
  status: string;
}

export interface MossScoringResult {
  controlScores: MossControlScoreResult[];
  domainScores: MossDomainScoreResult[];
  overallScore: number | null;
  completenessPercent: number;
  configurationStatus: 'PENDING_METHODOLOGY' | 'CONFIGURED';
  aggregation: {
    domain: MossAggregationMode;
    overall: MossAggregationMode;
  };
  calculationTrace: Record<string, unknown>;
}

export const MOSS_SCORE_LABELS: Record<MossControlMaturityScore, string> = {
  0: 'Non-existent',
  1: 'Ad hoc',
  2: 'Basic',
  3: 'Effective',
  4: 'Optimised',
};

/** Published v1 methodology after client acceptance of recommended defaults. */
export const MOSS_SCORING_CONFIG_V1_VERSION = '1.0.0';

export function publishedMeanMossScoringConfig(
  version = MOSS_SCORING_CONFIG_V1_VERSION,
): MossScoringConfig {
  return {
    version,
    status: 'PUBLISHED',
    domainAggregation: 'MEAN',
    overallAggregation: 'MEAN',
  };
}

/** Effective control score: finalScore if set, else assessorScore, else null. */
export function effectiveControlScore(input: {
  assessorScore?: number | null;
  finalScore?: number | null;
}): number | null {
  if (input.finalScore != null && Number.isFinite(input.finalScore)) {
    return clampScore(input.finalScore);
  }
  if (input.assessorScore != null && Number.isFinite(input.assessorScore)) {
    return clampScore(input.assessorScore);
  }
  return null;
}

function clampScore(n: number): MossControlMaturityScore {
  const v = Math.round(n);
  if (v < 0) return 0;
  if (v > 4) return 4;
  return v as MossControlMaturityScore;
}

export function isUnconfigured(config?: MossScoringConfig | null): boolean {
  if (!config) return true;
  if (config.status !== 'PUBLISHED') return true;
  return (
    config.domainAggregation === 'UNCONFIGURED' ||
    config.overallAggregation === 'UNCONFIGURED'
  );
}

/** Default sentinel when no published MEAN (or similar) config exists. */
export function defaultUnconfiguredMossScoringConfig(version = '0.0.0-unconfigured'): MossScoringConfig {
  return {
    version,
    status: 'DRAFT',
    domainAggregation: 'UNCONFIGURED',
    overallAggregation: 'UNCONFIGURED',
  };
}

/** UI/API display for overall or domain maturity scores. */
export function formatMossScoreDisplay(
  score: number | null | undefined,
  configurationStatus: 'PENDING_METHODOLOGY' | 'CONFIGURED',
  emptyLabel = '—',
): string {
  if (configurationStatus === 'PENDING_METHODOLOGY') {
    return 'Pending methodology configuration';
  }
  if (score == null || Number.isNaN(Number(score))) return emptyLabel;
  const n = Number(score);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function aggregate(values: number[], mode: MossAggregationMode, weights?: number[]): number | null {
  if (mode === 'UNCONFIGURED') return null;
  if (!values.length) return null;

  if (mode === 'MIN') {
    return Math.min(...values);
  }

  if (mode === 'MEAN') {
    const sum = values.reduce((a, b) => a + b, 0);
    return round4(sum / values.length);
  }

  if (mode === 'WEIGHTED_MEAN') {
    const w = weights && weights.length === values.length ? weights : values.map(() => 1);
    const totalW = w.reduce((a, b) => a + b, 0);
    if (totalW <= 0) return null;
    const sum = values.reduce((acc, v, i) => acc + v * w[i], 0);
    return round4(sum / totalW);
  }

  return null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Evaluate MOSS scores.
 * When config is missing/unpublished/UNCONFIGURED: domain + overall stay null;
 * completeness and per-control scores still populate.
 */
export function evaluateMossScores(
  controls: MossControlScoreInput[],
  config?: MossScoringConfig | null,
  domainCodesOrdered?: string[],
): MossScoringResult {
  const cfg = config ?? defaultUnconfiguredMossScoringConfig();
  const pending = isUnconfigured(cfg);

  const controlScores: MossControlScoreResult[] = controls.map((c) => {
    const score = effectiveControlScore(c);
    return {
      controlCode: c.controlCode,
      domainCode: c.domainCode,
      score,
      status: c.status || (score == null ? 'NOT_STARTED' : 'SCORED'),
    };
  });

  const scoredCount = controlScores.filter((c) => c.score != null).length;
  const total = controlScores.length;
  const completenessPercent = total === 0 ? 0 : round4((scoredCount / total) * 100);

  const domains = new Map<string, MossControlScoreResult[]>();
  for (const c of controlScores) {
    const list = domains.get(c.domainCode) || [];
    list.push(c);
    domains.set(c.domainCode, list);
  }

  const orderedDomainCodes =
    domainCodesOrdered?.length
      ? domainCodesOrdered
      : Array.from(domains.keys()).sort();

  const domainScores: MossDomainScoreResult[] = orderedDomainCodes.map((domainCode) => {
    const list = domains.get(domainCode) || [];
    const scored = list.filter((c) => c.score != null);
    const values = scored.map((c) => c.score as number);
    const controlsTotal = list.length;
    const controlsScored = scored.length;
    const completionPercent =
      controlsTotal === 0 ? 0 : round4((controlsScored / controlsTotal) * 100);

    let score: number | null = null;
    if (!pending && cfg.domainAggregation !== 'UNCONFIGURED') {
      score = aggregate(values, cfg.domainAggregation);
    }

    return {
      domainCode,
      score,
      controlsScored,
      controlsTotal,
      completionPercent,
    };
  });

  let overallScore: number | null = null;
  if (!pending && cfg.overallAggregation !== 'UNCONFIGURED') {
    if (cfg.overallAggregation === 'WEIGHTED_MEAN') {
      const values: number[] = [];
      const weights: number[] = [];
      for (const d of domainScores) {
        if (d.score == null) continue;
        values.push(d.score);
        weights.push(cfg.domainWeights?.[d.domainCode] ?? 1);
      }
      overallScore = aggregate(values, 'WEIGHTED_MEAN', weights);
    } else if (cfg.overallAggregation === 'MEAN' || cfg.overallAggregation === 'MIN') {
      // Prefer domain scores when present; otherwise fall back to control scores.
      const domainValues = domainScores.map((d) => d.score).filter((s): s is number => s != null);
      if (domainValues.length) {
        overallScore = aggregate(domainValues, cfg.overallAggregation);
      } else {
        const controlValues = controlScores.map((c) => c.score).filter((s): s is number => s != null);
        overallScore = aggregate(controlValues, cfg.overallAggregation);
      }
    }
  }

  return {
    controlScores,
    domainScores,
    overallScore,
    completenessPercent,
    configurationStatus: pending ? 'PENDING_METHODOLOGY' : 'CONFIGURED',
    aggregation: {
      domain: pending ? 'UNCONFIGURED' : cfg.domainAggregation,
      overall: pending ? 'UNCONFIGURED' : cfg.overallAggregation,
    },
    calculationTrace: {
      engine: 'moss-scoring',
      configVersion: cfg.version,
      configStatus: cfg.status,
      pendingMethodology: pending,
      scoredCount,
      totalControls: total,
      note: pending
        ? 'Aggregation UNCONFIGURED — domain/overall scores withheld pending client methodology.'
        : 'Aggregation applied from published MossScoringConfig.',
    },
  };
}
