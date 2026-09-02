import { readProposalContextSnapshot } from '../../common/triage-proposal-context';
import { calculateProposalFees, recalculateAllLineItems } from './proposal-fee-calculations';
import {
  applyProposalPlaceholders,
  buildPlaceholderMap,
  BUILTIN_TEMPLATES,
  defaultEadFeeLineItems,
  defaultMethodologyItems,
  defaultProjectExclusions,
  defaultTimelineFromPhases,
  readContentSnapshot,
  resolveClientCompany,
} from './proposal-template-registry';
import type {
  PhysicalRiskProposalInput,
  ProposalContentSnapshot,
  ProposalFeeDefaults,
  ProposalTemplateConfig,
} from './proposal-template-types';
import { dedupeRepeatedNarrative, stripHtmlToPlain } from './proposal-rich-text';

export function resolveTemplateConfig(productCode: string, dbTemplate?: ProposalTemplateConfig | null) {
  if (dbTemplate) return dbTemplate;
  const builtIn = BUILTIN_TEMPLATES.find((t) => t.productCode === productCode);
  if (builtIn) return builtIn as ProposalTemplateConfig;
  return BUILTIN_TEMPLATES[0] as ProposalTemplateConfig;
}

export function buildUnderstandingOfNeedsNarrative(input: {
  clientCompany: string;
  triageReference?: string | null;
  assuranceScore?: number | null;
  assuranceBandLabel?: string | null;
  primaryConcern?: string | null;
  strongestIndicators?: string[];
  operationalSitesLabel?: string | null;
  securityExpenditureLabel?: string | null;
  industry?: string | null;
  templateText?: string | null;
}): string {
  if (input.templateText?.trim()) return input.templateText.trim();
  const parts: string[] = [];
  parts.push(
    `${input.clientCompany} has engaged Physical Risk following completion of the Executive Governance Triage${input.triageReference ? ` (${input.triageReference})` : ''}.`,
  );
  if (input.assuranceScore != null) {
    parts.push(
      `The preliminary assurance indication of ${input.assuranceScore}/100${input.assuranceBandLabel ? ` (${input.assuranceBandLabel})` : ''} suggests that structured executive review is warranted.`,
    );
  }
  if (input.primaryConcern) {
    parts.push(`Primary concern identified: ${input.primaryConcern}.`);
  } else if (input.strongestIndicators?.length) {
    parts.push(`Key areas requiring attention include ${input.strongestIndicators.slice(0, 3).join(', ')}.`);
  }
  if (input.operationalSitesLabel) {
    parts.push(`The organisation operates ${input.operationalSitesLabel.toLowerCase()}.`);
  }
  if (input.securityExpenditureLabel) {
    parts.push(`Reported security expenditure: ${input.securityExpenditureLabel}.`);
  }
  if (input.industry) {
    parts.push(`Industry context: ${input.industry}.`);
  }
  parts.push(
    'Physical Risk proposes a structured engagement to provide independent, evidence-led insight and decision-ready recommendations for executive consideration.',
  );
  return parts.join('\n\n');
}

export function buildDefaultContentSnapshot(
  productCode: string,
  template: ProposalTemplateConfig,
): ProposalContentSnapshot {
  const feeDefaults: ProposalFeeDefaults = template.feeDefaults || {
    analystHourlyRate: 985,
    specialistHourlyRate: 1825,
    vatRate: 0.15,
    currency: 'ZAR',
    paymentTerms: '50% on acceptance, 50% on delivery',
  };
  const phases = template.defaultPhases?.length ? template.defaultPhases : BUILTIN_TEMPLATES[0].defaultPhases;
  return {
    phases,
    feeLineItems: defaultEadFeeLineItems(feeDefaults),
    timelineRows: defaultTimelineFromPhases(phases),
    teamMembers: [],
    experienceItems: [],
    methodologyItems: template.defaultMethodologyItems?.length
      ? template.defaultMethodologyItems
      : defaultMethodologyItems(),
    deliverableSections: template.defaultDeliverableSections || [],
    projectExclusions: defaultProjectExclusions(productCode),
    feeAssumptions: [
      'Fees exclude VAT unless otherwise stated.',
      'Travel, accommodation and disbursements billed at cost subject to prior approval.',
      'Overruns beyond agreed scope require written client approval.',
    ],
  };
}

export function buildPhysicalRiskProposalInput(input: {
  lead: {
    organisationName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    industry?: string | null;
    scopeClientObjectives?: string | null;
    scopeSitesOrBusinessUnits?: string | null;
    scopeIndicativeScope?: string | null;
    scopeExpectedTimeline?: string | null;
  };
  organisation?: {
    legalName?: string | null;
    name?: string | null;
    tradingName?: string | null;
    industry?: string | null;
    country?: string | null;
  } | null;
  proposal: Record<string, unknown>;
  template?: ProposalTemplateConfig | null;
  assessmentReference?: string | null;
  preparedByName?: string | null;
  preparedByEmail?: string | null;
  issuedDate?: Date;
}): PhysicalRiskProposalInput {
  const p = input.proposal;
  const productCode = String(p.productCode || 'EXECUTIVE_ADVISORY_DIAGNOSTIC');
  const template = resolveTemplateConfig(productCode, input.template);
  const triageSnap = readProposalContextSnapshot(p.contextSnapshot);
  const content = readContentSnapshot(p.contentSnapshot);
  const hasContent = content.phases.length > 0 || content.feeLineItems.length > 0;
  const defaultContent = hasContent ? content : buildDefaultContentSnapshot(productCode, template);

  const clientCompany = resolveClientCompany({
    legalName: input.organisation?.legalName,
    organisationName: input.organisation?.name,
    tradingName: input.organisation?.tradingName,
    leadOrganisationName: input.lead.organisationName,
  });
  const clientContact = [input.lead.firstName, input.lead.lastName].filter(Boolean).join(' ').trim();
  const issued = input.issuedDate || new Date();
  const proposalDate = issued.toLocaleDateString('en-ZA', { dateStyle: 'long' });
  const validUntil = p.validUntil
    ? new Date(String(p.validUntil)).toLocaleDateString('en-ZA', { dateStyle: 'long' })
    : null;
  const proposalTitle = String(p.title || template.titleTemplate).trim();
  const feeDefaults: ProposalFeeDefaults = template.feeDefaults || {
    analystHourlyRate: 985,
    specialistHourlyRate: 1825,
    vatRate: 0.15,
    currency: 'ZAR',
    paymentTerms: '50% on acceptance, 50% on delivery',
  };

  const placeholders = buildPlaceholderMap({
    clientCompany,
    clientContact,
    clientPosition: triageSnap?.prospect?.jobTitle,
    proposalNumber: String(p.proposalNumber || 'DRAFT'),
    proposalDate,
    proposalVersion: Number(p.version) || 1,
    proposalTitle,
    triageReference: triageSnap?.triageReference || input.assessmentReference,
    paymentTerms: String(p.paymentTerms || feeDefaults.paymentTerms),
    validUntil: validUntil || '',
    leadConsultant: input.preparedByName || '',
  });

  const understandingOfNeeds = dedupeRepeatedNarrative(
    String(p.understandingOfNeeds || '').trim()
    || buildUnderstandingOfNeedsNarrative({
      clientCompany,
      triageReference: triageSnap?.triageReference || input.assessmentReference,
      assuranceScore: triageSnap?.assuranceScore,
      assuranceBandLabel: triageSnap?.assuranceBandLabel,
      primaryConcern: triageSnap?.primaryConcern,
      strongestIndicators: (triageSnap?.strongestIndicators || []).map((i) => i.category),
      operationalSitesLabel: triageSnap?.organisation?.operationalSitesLabel,
      securityExpenditureLabel: triageSnap?.organisation?.securityExpenditureLabel,
      industry: input.organisation?.industry || input.lead.industry,
      templateText: template.understandingNeedsTemplate
        ? applyProposalPlaceholders(template.understandingNeedsTemplate, placeholders)
        : null,
    }),
  );

  const feeLineItems = recalculateAllLineItems(defaultContent.feeLineItems);
  const discount = Number(p.discount) || 0;
  const vatRate = Number(p.vatRate ?? feeDefaults.vatRate) || 0;
  const expensesEstimate = Number(p.expensesEstimate) || 0;
  const feeTotals = calculateProposalFees({ lineItems: feeLineItems, discount, vatRate, expensesEstimate });

  let objectives = dedupeRepeatedNarrative(
    String(p.objectives || input.lead.scopeClientObjectives || '').trim(),
  );
  // Do not reuse Understanding narrative as Objectives when they were incorrectly seeded the same.
  const understandingPlain = stripHtmlToPlain(understandingOfNeeds).replace(/\s+/g, ' ').trim().toLowerCase();
  const objectivesPlain = stripHtmlToPlain(objectives).replace(/\s+/g, ' ').trim().toLowerCase();
  if (objectivesPlain && understandingPlain && objectivesPlain === understandingPlain) {
    objectives = '';
  }
  objectives =
    objectives
    || applyProposalPlaceholders(template.objectiveTemplate || '', placeholders);

  return {
    proposalNumber: String(p.proposalNumber || 'DRAFT'),
    proposalVersion: Number(p.version) || 1,
    proposalDate,
    validUntil,
    productCode,
    proposalTitle,
    proposalSubtitle: String(p.subtitle || template.subtitleTemplate || '') || null,
    clientCompany,
    clientContact,
    clientPosition: triageSnap?.prospect?.jobTitle || null,
    clientEmail: input.lead.email,
    clientPhone: input.lead.phone || null,
    clientIndustry: input.organisation?.industry || input.lead.industry || null,
    clientCountry: input.organisation?.country || triageSnap?.organisation?.country || null,
    triageReference: triageSnap?.triageReference || input.assessmentReference || null,
    assuranceScore: triageSnap?.assuranceScore ?? null,
    assuranceBandLabel: triageSnap?.assuranceBandLabel ?? null,
    understandingOfNeeds,
    objectives,
    scope:
      String(p.scopeSummary || input.lead.scopeIndicativeScope || '').trim()
      || applyProposalPlaceholders(template.scopeTemplate || '', placeholders),
    approach:
      String(p.approach || '').trim()
      || applyProposalPlaceholders(template.approachTemplate || '', placeholders),
    methodology:
      String(p.methodology || '').trim()
      || applyProposalPlaceholders(
        template.methodologyTemplate || 'Physical Risk utilises established strategy, risk and Total Security Management methodologies.',
        placeholders,
      ),
    deliverables:
      String(p.deliverables || '').trim()
      || applyProposalPlaceholders(template.deliverablesTemplate || '', placeholders),
    exclusions:
      String(p.exclusions || '').trim()
      || defaultContent.projectExclusions.join('\n')
      || applyProposalPlaceholders(template.exclusionsTemplate || '', placeholders),
    assumptions:
      String(p.assumptions || '').trim()
      || defaultContent.feeAssumptions.join('\n')
      || applyProposalPlaceholders(template.assumptionTemplate || '', placeholders),
    statementOfResponsibility:
      String(p.statementOfResponsibility || '').trim()
      || applyProposalPlaceholders(template.responsibilityTemplate || '', placeholders),
    termsAndConditions:
      String(p.termsAndConditions || '').trim()
      || applyProposalPlaceholders(template.termsTemplate || '', placeholders),
    acceptanceTerms:
      String(p.acceptanceTerms || '').trim()
      || applyProposalPlaceholders(template.acceptanceTemplate || '', placeholders),
    paymentTerms: String(p.paymentTerms || feeDefaults.paymentTerms).trim(),
    timelineNarrative: String(p.timelineNarrative || input.lead.scopeExpectedTimeline || '') || null,
    estimatedProjectWeeks: p.estimatedProjectWeeks != null ? Number(p.estimatedProjectWeeks) : null,
    preparedByName: input.preparedByName || null,
    preparedByEmail: input.preparedByEmail || null,
    projectSponsor: String(p.projectSponsor || '') || null,
    projectChampion: String(p.projectChampion || '') || null,
    leadConsultant: input.preparedByName || null,
    currency: String(p.currency || feeDefaults.currency),
    analystHourlyRate: Number(p.analystHourlyRate ?? feeDefaults.analystHourlyRate),
    specialistHourlyRate: Number(p.specialistHourlyRate ?? feeDefaults.specialistHourlyRate),
    vatRate,
    discount,
    expensesEstimate,
    content: { ...defaultContent, feeLineItems },
    feeTotals,
  };
}
