import { dedupeRepeatedNarrative } from '@/lib/proposal-html';

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

export type ProposalContentSnapshot = {
  phases: ProposalPhase[];
  feeLineItems: ProposalFeeLineItem[];
  timelineRows: ProposalTimelineRow[];
  teamMembers: ProposalTeamMember[];
  experienceItems: ProposalExperienceItem[];
  methodologyItems: { name: string; description: string }[];
  deliverableSections: { title: string; description: string }[];
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
    projectExclusions: [],
    feeAssumptions: [],
  };
}

export function workspaceToDraft(ws: ProposalWorkspace): ProposalWorkspaceDraft {
  return {
    organisationName: ws.organisationName || '',
    addressedTo: ws.addressedTo || '',
    jobTitle: ws.jobTitle || '',
    email: ws.email || '',
    phone: ws.phone || '',
    introduction: ws.introduction || '',
    deliverables: ws.deliverables || '',
    terms: ws.terms || '',
    clientObjective: dedupeRepeatedNarrative(ws.clientObjective || ''),
    sitesOrBusinessUnits: ws.sitesOrBusinessUnits || '',
    indicativeScope: dedupeRepeatedNarrative(ws.indicativeScope || ''),
    timeline: ws.timeline || '',
    currency: normalizeProposalCurrency(ws.currency),
    subtitle: ws.subtitle || '',
    understandingOfNeeds: dedupeRepeatedNarrative(ws.understandingOfNeeds || ''),
    methodology: ws.methodology || '',
    approach: ws.approach || '',
    exclusions: ws.exclusions || '',
    assumptions: ws.assumptions || '',
    statementOfResponsibility: ws.statementOfResponsibility || '',
    termsAndConditions: ws.termsAndConditions || '',
    acceptanceTerms: ws.acceptanceTerms || '',
    analystHourlyRate: ws.analystHourlyRate != null ? String(ws.analystHourlyRate) : '985',
    specialistHourlyRate: ws.specialistHourlyRate != null ? String(ws.specialistHourlyRate) : '1825',
    discount: ws.discount != null ? String(ws.discount) : '0',
    vatRate: ws.vatRate != null ? String(ws.vatRate) : '0.15',
    expensesEstimate: ws.expensesEstimate != null ? String(ws.expensesEstimate) : '0',
    paymentTerms: ws.paymentTerms || '',
    estimatedProjectWeeks: ws.estimatedProjectWeeks != null ? String(ws.estimatedProjectWeeks) : '',
    timelineNarrative: ws.timelineNarrative || '',
    projectSponsor: ws.projectSponsor || '',
    projectChampion: ws.projectChampion || '',
    contentSnapshot: ws.contentSnapshot || emptyContentSnapshot(),
  };
}

export function draftToPayload(draft: ProposalWorkspaceDraft, feeTotals?: ProposalFeeTotals) {
  return {
    organisationName: draft.organisationName,
    addressedTo: draft.addressedTo,
    jobTitle: draft.jobTitle,
    email: draft.email,
    phone: draft.phone,
    introduction: draft.introduction,
    deliverables: draft.deliverables,
    terms: draft.terms,
    clientObjective: dedupeRepeatedNarrative(draft.clientObjective),
    sitesOrBusinessUnits: draft.sitesOrBusinessUnits,
    indicativeScope: dedupeRepeatedNarrative(draft.indicativeScope),
    timeline: draft.timeline,
    currency: draft.currency,
    subtitle: draft.subtitle,
    understandingOfNeeds: dedupeRepeatedNarrative(draft.understandingOfNeeds),
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
    contentSnapshot: draft.contentSnapshot,
    expectedGrandTotal: feeTotals?.grandTotal,
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

export function recalcLineItemFee(item: ProposalFeeLineItem): ProposalFeeLineItem {
  if (item.hours != null && item.rate != null) {
    return { ...item, fee: Math.round(Number(item.hours) * Number(item.rate) * 100) / 100 };
  }
  return item;
}

export function clientFeeTotals(draft: ProposalWorkspaceDraft): ProposalFeeTotals {
  const subtotal = draft.contentSnapshot.feeLineItems.reduce(
    (sum, row) => sum + (Number(row.fee) || 0),
    0,
  );
  const discount = Math.max(0, Number(draft.discount) || 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const vatRate = Number(draft.vatRate) || 0;
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
