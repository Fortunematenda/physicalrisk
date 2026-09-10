export type ProposalPhase = {
  sequence: number;
  name: string;
  keyActivities: string;
  deliverables: string;
  clientRole?: string;
  physicalRiskRole?: string;
  indicativeOutput?: string;
  startWeek?: number;
  endWeek?: number;
};

export type ProposalFeeLineItem = {
  id: string;
  phase: string;
  description: string;
  hours?: number | null;
  rate?: number | null;
  fee: number;
  parentId?: string | null;
  sequence: number;
};

export type ProposalTimelineRow = {
  name: string;
  startWeek: number;
  endWeek: number;
  sequence: number;
};

export type ProposalTeamMember = {
  profileId?: string | null;
  name: string;
  role: string;
  projectPosition?: string | null;
  biography?: string | null;
  summary?: string | null;
  relevantAreasOfKnowledge?: string | null;
  qualifications?: string | null;
  yearsExperience?: number | null;
  displayOrder: number;
};

export type ProposalExperienceItem = {
  experienceId?: string | null;
  clientName: string;
  description: string;
  engagementTitle?: string | null;
  displayOrder: number;
};

export const PROPOSAL_SECTION_HEADING_KEYS = [
  'introduction',
  'understanding',
  'scope',
  'methodology',
  'approach',
  'detailedApproach',
  'deliverables',
  'fees',
  'assumptions',
  'timelines',
  'teamStructure',
  'team',
  'appendixA',
  'appendixB',
] as const;

export type ProposalSectionHeadingKey = (typeof PROPOSAL_SECTION_HEADING_KEYS)[number];

export const DEFAULT_PROPOSAL_SECTION_HEADINGS: Record<ProposalSectionHeadingKey, string> = {
  introduction: 'Introduction',
  understanding: 'Understanding your needs',
  scope: 'Scope and Objectives',
  methodology: 'Methodology',
  approach: 'Approach',
  detailedApproach: 'Our detailed approach',
  deliverables: 'Deliverables',
  fees: 'Our proposed fees',
  assumptions: 'Fees and project assumptions',
  timelines: 'Proposed timelines',
  teamStructure: 'Proposed team structure',
  team: 'Proposed team',
  appendixA: 'Appendix A - Terms & conditions of service',
  appendixB: 'Appendix B - Acceptance of proposal',
};

export const PROPOSAL_SECTION_HEADING_LABELS: Record<ProposalSectionHeadingKey, string> = {
  introduction: 'Introduction',
  understanding: 'Understanding',
  scope: 'Scope',
  methodology: 'Methodology',
  approach: 'Approach',
  detailedApproach: 'Detailed approach',
  deliverables: 'Deliverables',
  fees: 'Fees',
  assumptions: 'Assumptions',
  timelines: 'Timelines',
  teamStructure: 'Team structure',
  team: 'Team',
  appendixA: 'Appendix A',
  appendixB: 'Appendix B',
};

export type ProposalContentSnapshot = {
  phases: ProposalPhase[];
  feeLineItems: ProposalFeeLineItem[];
  timelineRows: ProposalTimelineRow[];
  teamMembers: ProposalTeamMember[];
  experienceItems: ProposalExperienceItem[];
  methodologyItems: { name: string; description: string }[];
  deliverableSections: { title: string; description: string }[];
  /** Admin-authored extra PDF sections (after Deliverables, before Fees). */
  customSections?: Array<{
    id: string;
    title: string;
    body: string;
    sequence: number;
    pageBreak?: boolean;
  }>;
  /** Optional overrides for fixed PDF section titles (Contents + page headers). */
  sectionHeadings?: Partial<Record<ProposalSectionHeadingKey, string>>;
  /** Intro paragraph above the fees table (time-and-materials / rates copy). */
  feesIntroduction?: string | null;
  projectExclusions: string[];
  feeAssumptions: string[];
};

export type ProposalFeeTotals = {
  subtotal: number;
  discountedSubtotal: number;
  vatAmount: number;
  grandTotal: number;
};

export type ProposalValidationIssue = {
  field: string;
  message: string;
  blocking: boolean;
};

/** Workspace tab + scroll target for a readiness validation field. */
export type ProposalValidationTarget = {
  tab: string;
  fieldId: string;
};

/**
 * Maps API validateProposalForSend() field keys to proposal workspace tabs/anchors.
 * Used by “Complete missing information” deep-links.
 */
export const PROPOSAL_VALIDATION_FIELD_TARGETS: Record<string, ProposalValidationTarget> = {
  clientCompany: { tab: 'client', fieldId: 'organisationName' },
  clientContact: { tab: 'client', fieldId: 'addressedTo' },
  proposalTitle: { tab: 'overview', fieldId: 'subtitle' },
  proposalNumber: { tab: 'overview', fieldId: 'overview' },
  objectives: { tab: 'scope', fieldId: 'clientObjective' },
  scope: { tab: 'scope', fieldId: 'indicativeScope' },
  deliverables: { tab: 'scope', fieldId: 'deliverables' },
  understandingOfNeeds: { tab: 'understanding', fieldId: 'understandingOfNeeds' },
  termsAndConditions: { tab: 'terms', fieldId: 'termsAndConditions' },
  acceptanceTerms: { tab: 'terms', fieldId: 'acceptanceTerms' },
  paymentTerms: { tab: 'fees', fieldId: 'paymentTerms' },
  phases: { tab: 'methodology', fieldId: 'phases' },
  feeLineItems: { tab: 'fees', fieldId: 'feeLineItems' },
  feeTotals: { tab: 'fees', fieldId: 'feeLineItems' },
  preparedByName: { tab: 'team', fieldId: 'team' },
};

export function proposalValidationTarget(field: string | null | undefined): ProposalValidationTarget {
  const key = String(field || '').trim();
  if (!key) return { tab: 'overview', fieldId: 'overview' };
  if (PROPOSAL_VALIDATION_FIELD_TARGETS[key]) return PROPOSAL_VALIDATION_FIELD_TARGETS[key];
  const byFieldId = Object.values(PROPOSAL_VALIDATION_FIELD_TARGETS).find((t) => t.fieldId === key);
  if (byFieldId) return byFieldId;
  return { tab: 'overview', fieldId: key };
}

export function proposalFieldDomId(fieldId: string): string {
  return `proposal-field-${fieldId}`;
}

export const PROPOSAL_CURRENCY_OPTIONS = [
  { value: 'ZAR', label: 'ZAR — South African Rand' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'NAD', label: 'NAD — Namibian Dollar' },
] as const;

export function normalizeProposalCurrency(currency?: string | null): string {
  const code = (currency || 'ZAR').trim().toUpperCase();
  return code === 'R' ? 'ZAR' : code;
}

export function currencyUnitLabel(currency?: string | null): string {
  return normalizeProposalCurrency(currency);
}

export type ProposalWorkspace = {
  organisationName?: string;
  addressedTo?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  introduction?: string;
  deliverables?: string;
  terms?: string;
  clientObjective?: string;
  sitesOrBusinessUnits?: string;
  indicativeScope?: string;
  timeline?: string;
  fee?: number | null;
  currency?: string;
  triageReference?: string;
  assuranceScore?: number | null;
  assuranceBandLabel?: string | null;
  productCode?: string;
  subtitle?: string;
  understandingOfNeeds?: string;
  methodology?: string;
  approach?: string;
  exclusions?: string;
  assumptions?: string;
  statementOfResponsibility?: string;
  termsAndConditions?: string;
  acceptanceTerms?: string;
  analystHourlyRate?: number | null;
  specialistHourlyRate?: number | null;
  discount?: number;
  vatRate?: number;
  expensesEstimate?: number;
  paymentTerms?: string;
  estimatedProjectWeeks?: number | null;
  timelineNarrative?: string;
  projectSponsor?: string;
  projectChampion?: string;
  contentSnapshot?: ProposalContentSnapshot;
  feeTotals?: ProposalFeeTotals;
  readyToSend?: boolean;
  validationIssues?: ProposalValidationIssue[];
  version?: number;
  versionRevision?: number;
  versionLabel?: string;
  status?: string;
  /** Present when a stored proposal PDF/upload exists. */
  hasDocument?: boolean;
  proposalId?: string;
};

export type ProposalWorkspaceDraft = {
  organisationName: string;
  addressedTo: string;
  jobTitle: string;
  email: string;
  phone: string;
  introduction: string;
  deliverables: string;
  terms: string;
  clientObjective: string;
  sitesOrBusinessUnits: string;
  indicativeScope: string;
  timeline: string;
  currency: string;
  subtitle: string;
  understandingOfNeeds: string;
  methodology: string;
  approach: string;
  exclusions: string;
  assumptions: string;
  statementOfResponsibility: string;
  termsAndConditions: string;
  acceptanceTerms: string;
  analystHourlyRate: string;
  specialistHourlyRate: string;
  discount: string;
  vatRate: string;
  expensesEstimate: string;
  paymentTerms: string;
  estimatedProjectWeeks: string;
  timelineNarrative: string;
  projectSponsor: string;
  projectChampion: string;
  contentSnapshot: ProposalContentSnapshot;
};

export function emptyContentSnapshot(): ProposalContentSnapshot {
  return {
    phases: [],
    feeLineItems: [],
    timelineRows: [],
    teamMembers: [],
    experienceItems: [],
    methodologyItems: [],
    deliverableSections: [],
    customSections: [],
    sectionHeadings: {},
    feesIntroduction: null,
    projectExclusions: [],
    feeAssumptions: [],
  };
}

/** Convert stored TipTap/HTML (or plain) into editable plain text for textareas. */
export function toEditablePlain(value: string | null | undefined): string {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * True when text is the auto rates sentence (any currency/amount formatting).
 * Those should not be persisted — PDF regenerates from live Analyst/Specialist rates.
 */
export function isAutoFeesIntroduction(value: string | null | undefined): boolean {
  const plain = toEditablePlain(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!plain) return true;
  return (
    plain.startsWith('the costs below are estimated on a time-and-materials basis')
    && plain.includes('analyst rate:')
    && plain.includes('specialist rate:')
  );
}

/** Collapse TipTap accidental duplicate paragraphs of the same fees intro. */
export function collapseDuplicateFeesIntroduction(
  value: string | null | undefined,
): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const plain = toEditablePlain(raw).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  // Repeated identical paragraphs → keep a single copy.
  const parts = plain
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p === parts[0])) {
    return parts[0];
  }
  // Prefer original HTML when not a pure duplicate block.
  if (/<[a-z][\s\S]*>/i.test(raw) && !isAutoFeesIntroduction(raw)) return raw;
  return plain;
}

/** Persist only custom fees intro; auto rates sentence stays null so PDF tracks rates. */
export function feesIntroductionForSave(
  value: string | null | undefined,
): string | null {
  const collapsed = collapseDuplicateFeesIntroduction(value);
  if (!collapsed || isAutoFeesIntroduction(collapsed)) return null;
  return collapsed;
}

/** Editor display: custom text, else live default from current rates. */
export function feesIntroductionForDisplay(
  value: string | null | undefined,
  analystHourlyRate: string | number | null | undefined,
  specialistHourlyRate: string | number | null | undefined,
  currency?: string | null,
): string {
  const collapsed = collapseDuplicateFeesIntroduction(value);
  if (collapsed && !isAutoFeesIntroduction(collapsed)) return collapsed;
  return defaultFeesIntroduction(analystHourlyRate, specialistHourlyRate, currency);
}

export function workspaceToDraft(ws: ProposalWorkspace): ProposalWorkspaceDraft {
  const snap = ws.contentSnapshot || emptyContentSnapshot();
  const analystHourlyRate = ws.analystHourlyRate != null ? String(ws.analystHourlyRate) : '985';
  const specialistHourlyRate = ws.specialistHourlyRate != null ? String(ws.specialistHourlyRate) : '1825';
  const currency = normalizeProposalCurrency(ws.currency);
  const savedIntro = feesIntroductionForSave(snap.feesIntroduction);
  return {
    organisationName: ws.organisationName || '',
    addressedTo: ws.addressedTo || '',
    jobTitle: ws.jobTitle || '',
    email: ws.email || '',
    phone: ws.phone || '',
    introduction: ws.introduction || '',
    deliverables: ws.deliverables || '',
    terms: ws.terms || '',
    clientObjective: ws.clientObjective || '',
    sitesOrBusinessUnits: ws.sitesOrBusinessUnits || '',
    indicativeScope: ws.indicativeScope || '',
    timeline: ws.timeline || '',
    currency,
    subtitle: ws.subtitle || '',
    understandingOfNeeds: ws.understandingOfNeeds || '',
    methodology: ws.methodology || '',
    approach: ws.approach || '',
    exclusions: ws.exclusions || '',
    assumptions: ws.assumptions || '',
    statementOfResponsibility: ws.statementOfResponsibility || '',
    termsAndConditions: ws.termsAndConditions || '',
    acceptanceTerms: ws.acceptanceTerms || '',
    analystHourlyRate,
    specialistHourlyRate,
    discount: ws.discount != null ? String(ws.discount) : '0',
    vatRate: ws.vatRate != null ? String(ws.vatRate) : '0.15',
    expensesEstimate: ws.expensesEstimate != null ? String(ws.expensesEstimate) : '0',
    paymentTerms: ws.paymentTerms || '',
    estimatedProjectWeeks: ws.estimatedProjectWeeks != null ? String(ws.estimatedProjectWeeks) : '',
    timelineNarrative: ws.timelineNarrative || '',
    projectSponsor: ws.projectSponsor || '',
    projectChampion: ws.projectChampion || '',
    contentSnapshot: {
      ...snap,
      phases: snap.phases || [],
      teamMembers: snap.teamMembers || [],
      experienceItems: snap.experienceItems || [],
      customSections: snap.customSections || [],
      sectionHeadings: snap.sectionHeadings || {},
      // null = live rates default in the editor / PDF (do not lock stale rate text).
      feesIntroduction: savedIntro,
      methodologyItems: snap.methodologyItems || [],
    },
  };
}

export function draftToPayload(draft: ProposalWorkspaceDraft, _feeTotals?: ProposalFeeTotals) {
  return {
    organisationName: draft.organisationName,
    addressedTo: draft.addressedTo,
    jobTitle: draft.jobTitle,
    email: draft.email,
    phone: draft.phone,
    introduction: draft.introduction,
    deliverables: draft.deliverables,
    terms: draft.terms,
    clientObjective: draft.clientObjective,
    sitesOrBusinessUnits: draft.sitesOrBusinessUnits,
    indicativeScope: draft.indicativeScope,
    timeline: draft.timeline,
    currency: draft.currency,
    subtitle: draft.subtitle,
    understandingOfNeeds: draft.understandingOfNeeds,
    methodology: draft.methodology,
    approach: draft.approach,
    exclusions: draft.exclusions,
    assumptions: draft.assumptions,
    statementOfResponsibility: draft.statementOfResponsibility,
    termsAndConditions: draft.termsAndConditions,
    acceptanceTerms: draft.acceptanceTerms,
    analystHourlyRate: draft.analystHourlyRate ? Number(draft.analystHourlyRate) : null,
    specialistHourlyRate: draft.specialistHourlyRate ? Number(draft.specialistHourlyRate) : null,
    discount: draft.discount ? Number(draft.discount) : 0,
    vatRate: draft.vatRate ? Number(draft.vatRate) : 0.15,
    expensesEstimate: draft.expensesEstimate ? Number(draft.expensesEstimate) : 0,
    paymentTerms: draft.paymentTerms,
    estimatedProjectWeeks: draft.estimatedProjectWeeks ? Number(draft.estimatedProjectWeeks) : null,
    timelineNarrative: draft.timelineNarrative,
    projectSponsor: draft.projectSponsor,
    projectChampion: draft.projectChampion,
    contentSnapshot: {
      ...draft.contentSnapshot,
      feesIntroduction: feesIntroductionForSave(draft.contentSnapshot.feesIntroduction),
    },
  };
}

export function formatMoney(amount: number, currency = 'ZAR') {
  const code = normalizeProposalCurrency(currency);
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString('en-ZA')}`;
  }
}

/** Default PDF fees intro — editable on the Fees tab. */
export function defaultFeesIntroduction(
  analystHourlyRate: string | number | null | undefined,
  specialistHourlyRate: string | number | null | undefined,
  currency?: string | null,
): string {
  const analyst = Number(analystHourlyRate) || 985;
  const specialist = Number(specialistHourlyRate) || 1825;
  return `The costs below are estimated on a time-and-materials basis. Analyst rate: ${formatMoney(analyst, currency || 'ZAR')} per hour. Specialist rate: ${formatMoney(specialist, currency || 'ZAR')} per hour.`;
}

export function recalcLineItemFee(item: ProposalFeeLineItem): ProposalFeeLineItem {
  if (item.hours != null && item.rate != null) {
    return { ...item, fee: Math.round(Number(item.hours) * Number(item.rate) * 100) / 100 };
  }
  return item;
}

export function clientFeeTotals(draft: ProposalWorkspaceDraft): ProposalFeeTotals {
  const lineItems = draft.contentSnapshot.feeLineItems.map(recalcLineItemFee);
  const subtotal = lineItems.reduce((sum, row) => sum + (Number(row.fee) || 0), 0);
  const discount = Math.max(0, Number(draft.discount) || 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  // Accept 0.15 or 15 (%)
  const rawVat = Number(draft.vatRate) || 0;
  const vatRate = rawVat > 1 ? rawVat / 100 : rawVat;
  const vatAmount = Math.round(discountedSubtotal * vatRate * 100) / 100;
  const expenses = Number(draft.expensesEstimate) || 0;
  const grandTotal = Math.round((discountedSubtotal + vatAmount + expenses) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountedSubtotal: Math.round(discountedSubtotal * 100) / 100,
    vatAmount,
    grandTotal,
  };
}
