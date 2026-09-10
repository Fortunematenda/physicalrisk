import { readProposalContextSnapshot } from '../../common/triage-proposal-context';
import { calculateProposalFees, recalculateAllLineItems, normalizeVatRate } from './proposal-fee-calculations';
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
import {
  dedupeRepeatedNarrative,
  hasReadableProposalText,
  isClonedFromNarrative,
  rejectClonedNarrative,
  sanitizeProposalNarrativeHtml,
} from './proposal-rich-text';
import {
  formatProposalVersionCover,
  readProposalVersionParts,
} from './proposal-version';

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
  const phases =
    (template.defaultPhases?.length
      ? template.defaultPhases
      : BUILTIN_TEMPLATES[0]?.defaultPhases) || [];
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
    customSections: [],
    sectionHeadings: {},
    feesIntroduction: null,
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

  const clientCompanyResolved = resolveClientCompany({
    legalName: input.organisation?.legalName,
    organisationName: input.organisation?.name,
    tradingName: input.organisation?.tradingName,
    leadOrganisationName: input.lead.organisationName,
  });
  const addressee =
    ((triageSnap as { proposalAddressee?: Record<string, string | null> } | null)?.proposalAddressee)
    || {};
  const clientCompany =
    String(addressee.organisationName || '').trim() || clientCompanyResolved;
  const clientContact =
    String(addressee.addressedTo || '').trim()
    || [input.lead.firstName, input.lead.lastName].filter(Boolean).join(' ').trim();
  const clientPosition =
    String(addressee.jobTitle || '').trim() || triageSnap?.prospect?.jobTitle || null;
  const clientEmail =
    String(addressee.email || '').trim() || input.lead.email || null;
  const clientPhone =
    String(addressee.phone || '').trim() || input.lead.phone || null;
  const proposalIntroduction =
    typeof (triageSnap as { proposalIntroduction?: unknown } | null)?.proposalIntroduction === 'string'
      ? String((triageSnap as { proposalIntroduction?: string }).proposalIntroduction || '').trim() || null
      : null;
  const issued = input.issuedDate || new Date();
  const proposalDate = issued.toLocaleDateString('en-ZA', { dateStyle: 'long' });
  const validUntil = p.validUntil
    ? new Date(String(p.validUntil)).toLocaleDateString('en-ZA', { dateStyle: 'long' })
    : null;
  const proposalTitle = (() => {
    const raw = String(p.title || template.titleTemplate).trim();
    // Wayne Level 2 official name — normalize empty / outdated Governance wording.
    if (productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC') {
      if (!raw || /executive\s+governance\s+diagnostic/i.test(raw)) {
        return 'Executive Advisory Diagnostic';
      }
    }
    return raw || template.titleTemplate;
  })();
  const feeDefaults: ProposalFeeDefaults = template.feeDefaults || {
    analystHourlyRate: 985,
    specialistHourlyRate: 1825,
    vatRate: 0.15,
    currency: 'ZAR',
    paymentTerms: '50% on acceptance, 50% on delivery',
  };

  const versionParts = readProposalVersionParts(p as { version?: number; versionRevision?: number });
  const proposalVersionLabel = formatProposalVersionCover(versionParts.major, versionParts.revision);

  const placeholders = buildPlaceholderMap({
    clientCompany,
    clientContact,
    clientPosition: clientPosition || undefined,
    proposalNumber: String(p.proposalNumber || 'DRAFT'),
    proposalDate,
    proposalVersion: proposalVersionLabel,
    proposalTitle,
    triageReference: triageSnap?.triageReference || input.assessmentReference,
    paymentTerms: String(p.paymentTerms || feeDefaults.paymentTerms),
    validUntil: validUntil || '',
    leadConsultant: input.preparedByName || '',
  });

  const understandingRaw = String(p.understandingOfNeeds || '').trim();
  const understandingOfNeeds = hasReadableProposalText(understandingRaw)
    ? sanitizeProposalNarrativeHtml(understandingRaw)
    : sanitizeProposalNarrativeHtml(
      buildUnderstandingOfNeedsNarrative({
      clientCompany,
      triageReference: triageSnap?.triageReference || input.assessmentReference,
      assuranceScore: triageSnap?.assuranceScore,
      assuranceBandLabel: triageSnap?.assuranceBandLabel,
      primaryConcern: triageSnap?.primaryConcern,
      strongestIndicators: (triageSnap?.strongestIndicators || []).map((i) => i.category),
      operationalSitesLabel: triageSnap?.organisation?.operationalSitesLabel,
      securityExpenditureLabel: triageSnap?.organisation?.securityExpenditureLabel,
      industry: input.organisation?.industry || input.lead.industry,
      // Only use an admin-configured DB template — never builtin boilerplate
      templateText: input.template?.understandingNeedsTemplate
        ? applyProposalPlaceholders(input.template.understandingNeedsTemplate, placeholders)
        : null,
    }),
    );

  const feeLineItems = recalculateAllLineItems(defaultContent.feeLineItems);
  const discount = Number(p.discount) || 0;
  const vatRate = normalizeVatRate(
    (p.vatRate as number | string | null | undefined) ?? feeDefaults.vatRate,
  );
  const expensesEstimate = Number(p.expensesEstimate) || 0;
  const feeTotals = calculateProposalFees({ lineItems: feeLineItems, discount, vatRate, expensesEstimate });

  // TipTap forceMount flush historically copied Understanding into other fields —
  // drop those clones so only the Understanding slide carries that narrative.
  const undSource = understandingOfNeeds;

  // Prefer admin-saved / triage fields only — do not inject builtin template boilerplate at PDF time.
  const pickAdminText = (...candidates: Array<string | null | undefined>) => {
    for (const c of candidates) {
      const v = String(c || '').trim();
      if (v) return v;
    }
    return '';
  };
  // Try each candidate in order; skip Understanding/letter clones so later fallbacks still apply.
  const pickDistinct = (...candidates: Array<string | null | undefined>) => {
    for (const c of candidates) {
      const kept = rejectClonedNarrative(c, undSource);
      if (kept) return kept;
    }
    return '';
  };

  const scrubSnapshotText = (value: string | null | undefined) =>
    rejectClonedNarrative(value, undSource);

  const contentForPdf: ProposalContentSnapshot = {
    ...defaultContent,
    feeLineItems,
    phases: defaultContent.phases.map((phase) => {
      const keepOrBlank = (value: string | null | undefined) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return isClonedFromNarrative(raw, undSource) ? '' : raw;
      };
      return {
        ...phase,
        keyActivities: keepOrBlank(phase.keyActivities),
        deliverables: keepOrBlank(phase.deliverables),
        clientRole: keepOrBlank(phase.clientRole),
        physicalRiskRole: keepOrBlank(phase.physicalRiskRole),
        indicativeOutput: keepOrBlank(phase.indicativeOutput),
      };
    }),
    teamMembers: defaultContent.teamMembers.map((member) => ({
      ...member,
      biography: scrubSnapshotText(member.biography),
      summary: scrubSnapshotText(member.summary),
      qualifications: scrubSnapshotText(member.qualifications),
      relevantAreasOfKnowledge: scrubSnapshotText(member.relevantAreasOfKnowledge),
    })),
    experienceItems: (defaultContent.experienceItems || [])
      .map((exp) => ({
        ...exp,
        description: scrubSnapshotText(exp.description),
      }))
      .filter((exp) => Boolean(
        String(exp.description || '').trim()
        || String(exp.engagementTitle || '').trim()
        || String(exp.clientName || '').trim(),
      )),
    methodologyItems: (defaultContent.methodologyItems || []).map((item) => ({
      ...item,
      description: scrubSnapshotText(item.description),
    })),
    deliverableSections: (defaultContent.deliverableSections || []).map((section) => ({
      ...section,
      description: scrubSnapshotText(section.description),
    })),
    projectExclusions: (defaultContent.projectExclusions || []).filter(
      (line) => !isClonedFromNarrative(line, undSource),
    ),
    feeAssumptions: (defaultContent.feeAssumptions || []).filter(
      (line) => !isClonedFromNarrative(line, undSource),
    ),
    customSections: (defaultContent.customSections || [])
      .map((section) => ({
        ...section,
        title: String(section.title || '').trim(),
        body: scrubSnapshotText(section.body),
      }))
      .filter(
        (section) =>
          Boolean(section.title)
          || hasReadableProposalText(section.body),
      ),
    sectionHeadings: { ...(defaultContent.sectionHeadings || {}) },
    feesIntroduction: (() => {
      const raw = String(defaultContent.feesIntroduction || '').trim();
      if (!raw) return null;
      // Keep admin fees intro unless it is clearly Understanding/letter bleed.
      const cleaned = scrubSnapshotText(raw);
      if (!cleaned.trim()) return null;
      // Auto rates sentence is not stored as custom — PDF rebuilds from live rates.
      const plain = cleaned
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (
        plain.startsWith('the costs below are estimated on a time-and-materials basis')
        && plain.includes('analyst rate:')
        && plain.includes('specialist rate:')
      ) {
        return null;
      }
      return cleaned;
    })(),
  };

  return {
    proposalNumber: String(p.proposalNumber || 'DRAFT'),
    proposalVersion: proposalVersionLabel,
    proposalDate,
    validUntil,
    productCode,
    proposalTitle,
    proposalSubtitle: String(p.subtitle || '').trim() || null,
    proposalIntroduction,
    clientCompany,
    clientContact,
    clientPosition,
    clientEmail,
    clientPhone,
    clientIndustry: input.organisation?.industry || input.lead.industry || null,
    clientCountry: input.organisation?.country || triageSnap?.organisation?.country || null,
    triageReference: triageSnap?.triageReference || input.assessmentReference || null,
    assuranceScore: triageSnap?.assuranceScore ?? null,
    assuranceBandLabel: triageSnap?.assuranceBandLabel ?? null,
    understandingOfNeeds,
    // Prefer distinct admin text; if TipTap letter-bleed blanked it, still show the saved field.
    objectives: pickDistinct(
      p.objectives as string,
      input.lead.scopeClientObjectives,
    ) || pickAdminText(p.objectives as string, input.lead.scopeClientObjectives),
    scope: pickDistinct(
      p.scopeSummary as string,
      input.lead.scopeIndicativeScope,
    ) || pickAdminText(p.scopeSummary as string, input.lead.scopeIndicativeScope),
    sitesOrBusinessUnits:
      pickDistinct(
        p.sitesOrBusinessUnits as string,
        input.lead.scopeSitesOrBusinessUnits,
        triageSnap?.organisation?.operationalSitesLabel,
      )
      || pickAdminText(
        p.sitesOrBusinessUnits as string,
        input.lead.scopeSitesOrBusinessUnits,
        triageSnap?.organisation?.operationalSitesLabel,
      )
      || null,
    approach: pickDistinct(p.approach as string) || pickAdminText(p.approach as string),
    methodology: pickDistinct(p.methodology as string),
    deliverables: pickDistinct(p.deliverables as string),
    exclusions: pickDistinct(p.exclusions as string) || pickAdminText(p.exclusions as string),
    assumptions: pickDistinct(
      p.assumptions as string,
      input.template?.assumptionTemplate
        ? applyProposalPlaceholders(input.template.assumptionTemplate, placeholders)
        : '',
    ),
    statementOfResponsibility: pickDistinct(
      p.statementOfResponsibility as string,
      input.template?.responsibilityTemplate
        ? applyProposalPlaceholders(input.template.responsibilityTemplate, placeholders)
        : '',
    ),
    // Appendix A / Acceptance: keep admin-saved Terms-tab text even when an older
    // TipTap bleed copied Understanding into the same field. Blanking those as
    // "clones" made readiness say Terms were missing while the Terms tab still
    // showed content.
    termsAndConditions: (() => {
      const admin = pickAdminText(p.termsAndConditions as string);
      // Preserve full legal text — do not collapse repeated clauses.
      if (hasReadableProposalText(admin)) return admin;
      const fromTemplate = input.template?.termsTemplate
        ? applyProposalPlaceholders(input.template.termsTemplate, placeholders).trim()
        : '';
      if (fromTemplate) return fromTemplate;
      const legacy = pickAdminText(p.terms as string);
      return legacy && hasReadableProposalText(legacy) ? legacy : '';
    })(),
    acceptanceTerms: (() => {
      const admin = pickAdminText(p.acceptanceTerms as string);
      if (hasReadableProposalText(admin)) return admin;
      const fromTemplate = input.template?.acceptanceTemplate
        ? applyProposalPlaceholders(input.template.acceptanceTemplate, placeholders).trim()
        : '';
      return fromTemplate;
    })(),
    paymentTerms: pickAdminText(p.paymentTerms as string, feeDefaults.paymentTerms),
    timelineSummary: pickDistinct(
      p.timeline as string,
      input.lead.scopeExpectedTimeline,
    ) || null,
    timelineNarrative: (() => {
      const raw = pickDistinct(p.timelineNarrative as string);
      return raw ? dedupeRepeatedNarrative(raw) : null;
    })(),
    estimatedProjectWeeks: p.estimatedProjectWeeks != null ? Number(p.estimatedProjectWeeks) : null,
    preparedByName: input.preparedByName || null,
    preparedByEmail: input.preparedByEmail || null,
    projectSponsor: pickAdminText(p.projectSponsor as string) || null,
    projectChampion: pickAdminText(p.projectChampion as string) || null,
    leadConsultant:
      pickAdminText(
        p.leadConsultant as string,
        defaultContent.teamMembers.find((m) => m.name?.trim())?.name,
        input.preparedByName,
      ) || null,
    currency: String(p.currency || feeDefaults.currency),
    analystHourlyRate: Number(p.analystHourlyRate ?? feeDefaults.analystHourlyRate),
    specialistHourlyRate: Number(p.specialistHourlyRate ?? feeDefaults.specialistHourlyRate),
    vatRate,
    discount,
    expensesEstimate,
    content: contentForPdf,
    feeTotals,
  };
}
