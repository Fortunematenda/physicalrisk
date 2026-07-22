import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EspoCrmRuntimeConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  verifySsl: boolean;
  autoSync: boolean;
  followUpDays: number;
  assignedUserId: string | null;
  accountMossIdField: string;
  contactMossIdField: string;
  opportunityMossIdField: string;
  leadMossRefField: string;
  opportunityFields: {
    scliScore: string;
    riskRating: string;
    governanceScore: string;
    confidenceScore: string;
    opportunityScore: string;
    minLeakage: string;
    likelyLeakage: string;
    maxExposure: string;
    recoverableLow: string;
    recoverableHigh: string;
    highestRisk: string;
    recommendedService: string;
    status: string;
    reportUrl: string;
    assessmentReference: string;
  };
  accountFields: {
    numberOfSites: string | null;
    annualSecurityContractValue: string | null;
  };
  stages: Record<string, string>;
};

function bool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function num(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function str(value: string | undefined, fallback: string) {
  const trimmed = (value || '').trim();
  return trimmed || fallback;
}

/** Validate EspoCRM base URL shape and optional production HTTPS requirement. */
export function validateEspoBaseUrl(raw: string, nodeEnv: string): URL {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new BadRequestException('EspoCRM base URL is not configured.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('EspoCRM base URL is invalid.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('EspoCRM base URL must use http or https.');
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new BadRequestException('EspoCRM base URL must use HTTPS in production.');
  }
  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    if (nodeEnv === 'production') {
      throw new BadRequestException('EspoCRM base URL host is not allowed.');
    }
  }
  return parsed;
}

export function loadEspoCrmConfig(config: ConfigService): EspoCrmRuntimeConfig {
  const enabled = bool(config.get<string>('ESPOCRM_ENABLED'), false);
  const baseRaw = (config.get<string>('ESPOCRM_BASE_URL') || '').replace(/\/+$/, '');
  const apiKey = config.get<string>('ESPOCRM_API_KEY') || '';
  const nodeEnv = config.get<string>('NODE_ENV') || 'development';

  if (enabled && baseRaw) {
    validateEspoBaseUrl(baseRaw, nodeEnv);
  }

  const stages: Record<string, string> = {
    DRAFT: str(config.get<string>('ESPOCRM_STAGE_DRAFT'), 'Prospecting'),
    IN_PROGRESS: str(config.get<string>('ESPOCRM_STAGE_IN_PROGRESS'), 'Prospecting'),
    AWAITING_CONTRIBUTOR: str(config.get<string>('ESPOCRM_STAGE_AWAITING_CONTRIBUTOR'), 'Prospecting'),
    SUBMITTED: str(config.get<string>('ESPOCRM_STAGE_SUBMITTED'), 'Qualification'),
    AUTOMATED_EVALUATION_COMPLETE: str(
      config.get<string>('ESPOCRM_STAGE_AUTOMATED_EVALUATION_COMPLETE'),
      'Qualification',
    ),
    EVIDENCE_REVIEW: str(config.get<string>('ESPOCRM_STAGE_EVIDENCE_REVIEW'), 'Qualification'),
    ANALYST_REVIEW: str(config.get<string>('ESPOCRM_STAGE_ANALYST_REVIEW'), 'Qualification'),
    REVIEWED: str(config.get<string>('ESPOCRM_STAGE_REVIEWED'), 'Qualification'),
    QUALITY_ASSURANCE: str(config.get<string>('ESPOCRM_STAGE_QUALITY_ASSURANCE'), 'Qualification'),
    APPROVED: str(config.get<string>('ESPOCRM_STAGE_APPROVED'), 'Proposal'),
    REPORT_GENERATED: str(config.get<string>('ESPOCRM_STAGE_REPORT_GENERATED'), 'Proposal'),
    REPORT_ISSUED: str(config.get<string>('ESPOCRM_STAGE_REPORT_ISSUED'), 'Negotiation'),
  };

  return {
    enabled,
    baseUrl: baseRaw,
    apiKey,
    timeoutMs: num(
      config.get<string>('ESPOCRM_TIMEOUT') || config.get<string>('ESPOCRM_TIMEOUT_MS'),
      15000,
    ),
    verifySsl: bool(
      config.get<string>('ESPOCRM_VERIFY_SSL') || config.get<string>('ESPOCRM_VERIFY_TLS'),
      true,
    ),
    autoSync: bool(config.get<string>('ESPOCRM_AUTO_SYNC'), true),
    followUpDays: num(config.get<string>('ESPOCRM_FOLLOW_UP_DAYS'), 2),
    assignedUserId: (config.get<string>('ESPOCRM_DEFAULT_ASSIGNED_USER_ID') || '').trim() || null,
    accountMossIdField: str(config.get<string>('ESPOCRM_ACCOUNT_MOSS_ID_FIELD'), 'cMossOrganisationId'),
    contactMossIdField: str(config.get<string>('ESPOCRM_CONTACT_MOSS_ID_FIELD'), 'cMossContactId'),
    opportunityMossIdField: str(
      config.get<string>('ESPOCRM_OPPORTUNITY_MOSS_ID_FIELD'),
      'cMossAssessmentId',
    ),
    leadMossRefField: str(config.get<string>('ESPOCRM_LEAD_MOSS_REF_FIELD'), 'cMossAssessmentReference'),
    opportunityFields: {
      scliScore: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_SCLI_SCORE_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_SCLI_SCORE'),
        'cMossScliScore',
      ),
      riskRating: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_RISK_RATING_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_RISK_BAND'),
        'cMossRiskRating',
      ),
      governanceScore: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_GOVERNANCE_SCORE_FIELD'),
        'cMossGovernanceScore',
      ),
      confidenceScore: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_CONFIDENCE_SCORE_FIELD'),
        'cMossConfidenceScore',
      ),
      opportunityScore: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_OPPORTUNITY_SCORE_FIELD'),
        'cMossOpportunityScore',
      ),
      minLeakage: str(config.get<string>('ESPOCRM_OPPORTUNITY_MIN_LEAKAGE_FIELD'), 'cMossMinimumLeakage'),
      likelyLeakage: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_LIKELY_LEAKAGE_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_LIKELY_LEAKAGE'),
        'cMossLikelyLeakage',
      ),
      maxExposure: str(config.get<string>('ESPOCRM_OPPORTUNITY_MAX_EXPOSURE_FIELD'), 'cMossMaximumExposure'),
      recoverableLow: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_RECOVERABLE_LOW_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_RECOVERABLE_LOW'),
        'cMossRecoverableLow',
      ),
      recoverableHigh: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_RECOVERABLE_HIGH_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_RECOVERABLE_HIGH'),
        'cMossRecoverableHigh',
      ),
      highestRisk: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_HIGHEST_RISK_FIELD'),
        'cMossHighestRiskCategory',
      ),
      recommendedService: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_RECOMMENDED_SERVICE_FIELD'),
        'cMossRecommendedService',
      ),
      status: str(config.get<string>('ESPOCRM_OPPORTUNITY_STATUS_FIELD'), 'cMossAssessmentStatus'),
      reportUrl: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_REPORT_URL_FIELD') ||
          config.get<string>('ESPOCRM_FIELD_REPORT_URL'),
        'cMossReportUrl',
      ),
      assessmentReference: str(
        config.get<string>('ESPOCRM_OPPORTUNITY_REFERENCE_FIELD'),
        'cMossAssessmentReference',
      ),
    },
    accountFields: {
      numberOfSites: (config.get<string>('ESPOCRM_ACCOUNT_SITES_FIELD') || '').trim() || null,
      annualSecurityContractValue:
        (config.get<string>('ESPOCRM_ACCOUNT_CONTRACT_VALUE_FIELD') || '').trim() || null,
    },
    stages,
  };
}

export const ESPOCRM_SETTING_KEY = 'espocrm';

export type EspoCrmStoredConnection = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
};

/** Merge admin-saved connection overrides onto env-backed runtime config. */
export function applyEspoConnectionOverrides(
  base: EspoCrmRuntimeConfig,
  stored: EspoCrmStoredConnection | null | undefined,
): EspoCrmRuntimeConfig {
  if (!stored) return base;
  const baseUrl =
    typeof stored.baseUrl === 'string' && stored.baseUrl.trim()
      ? stored.baseUrl.trim().replace(/\/+$/, '')
      : base.baseUrl;
  const apiKey =
    typeof stored.apiKey === 'string' && stored.apiKey.length > 0 ? stored.apiKey : base.apiKey;
  return {
    ...base,
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : base.enabled,
    baseUrl,
    apiKey,
  };
}

export function parseEspoStoredConnection(value: unknown): EspoCrmStoredConnection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : undefined,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
  };
}

export function assertEspoConfigured(cfg: EspoCrmRuntimeConfig) {
  if (!cfg.enabled) throw new BadRequestException('EspoCRM integration is disabled.');
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new BadRequestException('EspoCRM base URL and API key must be configured.');
  }
  validateEspoBaseUrl(cfg.baseUrl, process.env.NODE_ENV || 'development');
}

export function redactSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(/X-Api-Key:\s*[^\s,]+/gi, 'X-Api-Key: [REDACTED]')
      .replace(/("?(?:apiKey|api_key|authorization|X-Api-Key)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[REDACTED]$3');
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/api[_-]?key|authorization|secret|password|token/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSecrets(entry);
      }
    }
    return out;
  }
  return value;
}
