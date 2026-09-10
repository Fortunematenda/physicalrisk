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
  color?: string;
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

export type ProposalMethodologyItem = {
  name: string;
  description: string;
};

export type ProposalDeliverableSection = {
  title: string;
  description: string;
};

/** Admin-authored extra PDF sections (beyond the fixed Physical Risk deck). */
export type ProposalCustomSection = {
  id: string;
  title: string;
  body: string;
  sequence: number;
  /** Start this section on a new landscape page. */
  pageBreak?: boolean;
};

/** Keys for editable major PDF section headings (Contents + page titles). */
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

export function resolveProposalSectionHeading(
  headings: Partial<Record<ProposalSectionHeadingKey, string>> | null | undefined,
  key: ProposalSectionHeadingKey,
): string {
  const override = String(headings?.[key] || '').trim();
  return override || DEFAULT_PROPOSAL_SECTION_HEADINGS[key];
}

export type ProposalContentSnapshot = {
  phases: ProposalPhase[];
  feeLineItems: ProposalFeeLineItem[];
  timelineRows: ProposalTimelineRow[];
  teamMembers: ProposalTeamMember[];
  experienceItems: ProposalExperienceItem[];
  methodologyItems: ProposalMethodologyItem[];
  deliverableSections: ProposalDeliverableSection[];
  /** Optional extra major sections rendered in the PDF after Deliverables. */
  customSections?: ProposalCustomSection[];
  /** Optional overrides for fixed PDF section titles (Contents + headers). */
  sectionHeadings?: Partial<Record<ProposalSectionHeadingKey, string>>;
  /**
   * Intro paragraph above the fees table
   * (e.g. time-and-materials + analyst/specialist rates).
   */
  feesIntroduction?: string | null;
  projectExclusions: string[];
  feeAssumptions: string[];
  acceptance?: {
    acceptedByName?: string | null;
    acceptedByEmail?: string | null;
    acceptedByPosition?: string | null;
    acceptedPlace?: string | null;
    acceptedDate?: string | null;
    clientVatNumber?: string | null;
  };
};

export type ProposalFeeDefaults = {
  analystHourlyRate: number;
  specialistHourlyRate: number;
  vatRate: number;
  currency: string;
  paymentTerms: string;
  mileageRate?: number;
  expenseBillingMethod?: string;
};

export type ProposalTemplateConfig = {
  name: string;
  productCode: string;
  titleTemplate: string;
  subtitleTemplate?: string | null;
  understandingNeedsTemplate?: string | null;
  objectiveTemplate?: string | null;
  methodologyTemplate?: string | null;
  scopeTemplate?: string | null;
  approachTemplate?: string | null;
  deliverablesTemplate?: string | null;
  exclusionsTemplate?: string | null;
  assumptionTemplate?: string | null;
  responsibilityTemplate?: string | null;
  termsTemplate?: string | null;
  acceptanceTemplate?: string | null;
  feeDefaults?: ProposalFeeDefaults | null;
  defaultPhases?: ProposalPhase[];
  defaultMethodologyItems?: ProposalMethodologyItem[];
  defaultDeliverableSections?: ProposalDeliverableSection[];
};

export type PhysicalRiskProposalInput = {
  proposalNumber: string;
  proposalVersion: number;
  proposalDate: string;
  validUntil?: string | null;
  productCode: string;
  proposalTitle: string;
  proposalSubtitle?: string | null;
  /** Optional letter intro from Overview tab (legacy). */
  proposalIntroduction?: string | null;
  clientCompany: string;
  clientContact: string;
  clientPosition?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientIndustry?: string | null;
  clientCountry?: string | null;
  triageReference?: string | null;
  assuranceScore?: number | null;
  assuranceBandLabel?: string | null;
  understandingOfNeeds: string;
  objectives: string;
  scope: string;
  /** Sites / business units from the Scope tab (admin workspace). */
  sitesOrBusinessUnits?: string | null;
  approach: string;
  methodology: string;
  deliverables: string;
  exclusions: string;
  assumptions: string;
  statementOfResponsibility: string;
  termsAndConditions: string;
  acceptanceTerms: string;
  paymentTerms: string;
  /** Short timeline summary from Timeline tab (e.g. "Approximately 10 weeks"). */
  timelineSummary?: string | null;
  timelineNarrative?: string | null;
  estimatedProjectWeeks?: number | null;
  preparedByName?: string | null;
  preparedByEmail?: string | null;
  projectSponsor?: string | null;
  projectChampion?: string | null;
  leadConsultant?: string | null;
  currency: string;
  analystHourlyRate: number;
  specialistHourlyRate: number;
  vatRate: number;
  discount: number;
  expensesEstimate: number;
  content: ProposalContentSnapshot;
  feeTotals: {
    subtotal: number;
    discountedSubtotal: number;
    vatAmount: number;
    grandTotal: number;
  };
};

export type ProposalPlaceholderMap = Record<string, string>;
