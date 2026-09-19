/**
 * Executive Advisory Diagnostic — single source of truth for module completion (Stage 7).
 * Frontend status, readiness banner, and backend Finish Diagnostic must all use this.
 */

import {
  hasValidBusinessConsequences,
  parseBusinessConsequenceCodes,
  type EadBusinessConsequenceCode,
} from './ead-business-consequences';
import {
  parseDiagnosticResponses,
  scoreEadDiagnostic,
  scoreEadDiagnosticCriteria,
  isEadDiagnosticModuleCode,
  type EadDiagnosticAnswers,
  type EadDiagnosticCriterion,
} from './ead-diagnostic-scoring';
import { isRichTextFilled, richTextToPlainText } from './ead-rich-text';

export type EadModuleMissingRequirement =
  | 'diagnosticResponses'
  | 'finding'
  | 'businessConsequences'
  | 'executiveDecision'
  | 'evidence';

export type EadModuleValidationResult = {
  isComplete: boolean;
  missingRequirements: EadModuleMissingRequirement[];
  /** True when the only outstanding item is evidence / limitation. */
  onlyEvidenceMissing: boolean;
};

export type EadModuleValidationInput = {
  moduleCode: string;
  finding?: string | null;
  requiredDecision?: string | null;
  evidenceSummary?: string | null;
  businessConsequences?: unknown;
  otherBusinessConsequence?: string | null;
  diagnosticResponses?: unknown;
  diagnosticAnswers?: EadDiagnosticAnswers | null;
  /** Count of successfully persisted attachments for THIS module only. */
  attachmentCount?: number;
  /** Active criteria for the module (preferred). Empty → fall back to built-in scoring. */
  criteria?: EadDiagnosticCriterion[] | null;
};

/** Statuses that mean the file was rejected / is not usable for completion. */
export const EAD_NON_COUNTABLE_EVIDENCE_STATUSES = [
  'REJECTED',
  'OUTDATED',
  'MISSING',
  'MISSING_INFORMATION',
  'NOT_APPLICABLE',
] as const;

export function isCountableEadEvidenceStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !(EAD_NON_COUNTABLE_EVIDENCE_STATUSES as readonly string[]).includes(String(status));
}

/**
 * Meaningful evidence limitation narrative.
 * Empty rich-text markup does not count. Trivial placeholders do not count.
 */
export function isMeaningfulEvidenceLimitation(value: unknown): boolean {
  if (!isRichTextFilled(value)) return false;
  const plain = richTextToPlainText(String(value ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!plain) return false;
  const blocked = new Set(['-', '–', '—', '.', '..', '...', 'n/a', 'na', 'none', 'test', 'tbd', 'todo']);
  if (blocked.has(plain)) return false;
  return plain.length >= 3;
}

export function isEadEvidenceRequirementSatisfied(input: {
  evidenceSummary?: string | null;
  attachmentCount?: number;
}): boolean {
  const attachments = Number(input.attachmentCount) || 0;
  if (attachments > 0) return true;
  return isMeaningfulEvidenceLimitation(input.evidenceSummary);
}

export function validateExecutiveAdvisoryModule(
  input: EadModuleValidationInput,
): EadModuleValidationResult {
  const missing: EadModuleMissingRequirement[] = [];

  if (!isRichTextFilled(input.finding)) missing.push('finding');

  const codes = parseBusinessConsequenceCodes(input.businessConsequences) as EadBusinessConsequenceCode[];
  if (!hasValidBusinessConsequences(codes, input.otherBusinessConsequence)) {
    missing.push('businessConsequences');
  }

  if (!isRichTextFilled(input.requiredDecision)) missing.push('executiveDecision');

  if (
    !isEadEvidenceRequirementSatisfied({
      evidenceSummary: input.evidenceSummary,
      attachmentCount: input.attachmentCount,
    })
  ) {
    missing.push('evidence');
  }

  if (isEadDiagnosticModuleCode(input.moduleCode)) {
    const answers =
      input.diagnosticAnswers ||
      parseDiagnosticResponses(input.diagnosticResponses)?.answers ||
      {};
    const criteria = input.criteria || [];
    const scored = criteria.length
      ? scoreEadDiagnosticCriteria(criteria, answers)
      : scoreEadDiagnostic(input.moduleCode, answers);
    // When criteria list is empty (still loading), require at least one answer as a soft gate.
    if (criteria.length === 0) {
      if (!Object.keys(answers).length) missing.push('diagnosticResponses');
    } else if (!scored.allRequiredAnswered) {
      missing.push('diagnosticResponses');
    }
  }

  const onlyEvidenceMissing = missing.length === 1 && missing[0] === 'evidence';
  return {
    isComplete: missing.length === 0,
    missingRequirements: missing,
    onlyEvidenceMissing,
  };
}

export function formatEadMissingRequirementLabel(key: EadModuleMissingRequirement): string {
  switch (key) {
    case 'diagnosticResponses':
      return 'Diagnostic criteria';
    case 'finding':
      return 'Finding';
    case 'businessConsequences':
      return 'Business consequences';
    case 'executiveDecision':
      return 'Required executive decision';
    case 'evidence':
      return 'Supporting evidence or limitation';
    default:
      return key;
  }
}

export function summariseEadModulesMissingEvidence(
  modules: Array<{ moduleName: string; validation: EadModuleValidationResult }>,
): string[] {
  return modules
    .filter((m) => m.validation.missingRequirements.includes('evidence'))
    .map((m) => m.moduleName);
}
