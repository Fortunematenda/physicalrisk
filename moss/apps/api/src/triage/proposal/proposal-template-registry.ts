import type {
  ProposalContentSnapshot,
  ProposalFeeDefaults,
  ProposalFeeLineItem,
  ProposalPhase,
  ProposalPlaceholderMap,
  ProposalTimelineRow,
} from './proposal-template-types';

export const DEFAULT_ANALYST_RATE = 985;
export const DEFAULT_SPECIALIST_RATE = 1825;
export const DEFAULT_VAT_RATE = 0.15;

export function resolveClientCompany(input: {
  legalName?: string | null;
  organisationName?: string | null;
  tradingName?: string | null;
  leadOrganisationName?: string | null;
}): string {
  return (
    input.legalName?.trim()
    || input.organisationName?.trim()
    || input.tradingName?.trim()
    || input.leadOrganisationName?.trim()
    || ''
  );
}

export function applyProposalPlaceholders(template: string, map: ProposalPlaceholderMap): string {
  let result = template;
  for (const [key, value] of Object.entries(map)) {
    const safe = value?.trim() || '';
    result = result.replaceAll(`{{${key}}}`, safe);
  }
  return result.replace(/\{\{[A-Z0-9_]+\}\}/g, '').trim();
}

export function defaultEadPhases(): ProposalPhase[] {
  return [
    {
      sequence: 1,
      name: 'Information Gathering and Assessment',
      keyActivities:
        'Stakeholder interviews, document review, current-state assurance mapping, site/business unit scoping.',
      deliverables: 'Current-state assessment findings and engagement workplan.',
      clientRole: 'Provide stakeholders, documentation and access.',
      physicalRiskRole: 'Plan engagement, gather background information, conduct interviews.',
      indicativeOutput: 'Current State Assessment Summary',
      startWeek: 1,
      endWeek: 4,
      color: '#2E75B6',
    },
    {
      sequence: 2,
      name: 'Define Target State',
      keyActivities:
        'Analyse findings, define target assurance posture, draft recommendations and executive briefing materials.',
      deliverables: 'Draft diagnostic findings and recommendations.',
      clientRole: 'Participate in workshops and validate findings.',
      physicalRiskRole: 'Analysis, consolidation and draft reporting.',
      indicativeOutput: 'Draft Executive Advisory Diagnostic Report',
      startWeek: 5,
      endWeek: 8,
      color: '#548235',
    },
    {
      sequence: 3,
      name: 'Reporting and Executive Briefing',
      keyActivities:
        'Finalise report, executive briefing, agree next steps including Level 3 routing where warranted.',
      deliverables: 'Final report and executive briefing pack.',
      clientRole: 'Review and approve deliverables.',
      physicalRiskRole: 'Final reporting and executive presentation.',
      indicativeOutput: 'Executive Advisory Diagnostic — Final Report',
      startWeek: 9,
      endWeek: 10,
      color: '#BF8F00',
    },
  ];
}

export function defaultStrategyPhases(): ProposalPhase[] {
  return [
    {
      sequence: 1,
      name: 'Information Gathering and Assessment',
      keyActivities:
        'Stakeholder engagement, security environment review, risk and threat assessment.',
      deliverables: 'Current-state security assessment.',
      startWeek: 1,
      endWeek: 6,
      color: '#2E75B6',
    },
    {
      sequence: 2,
      name: 'Define TO BE',
      keyActivities:
        'Draft integrated security strategy, operational security model and implementation plan.',
      deliverables: 'Draft strategy and operating model.',
      startWeek: 7,
      endWeek: 14,
      color: '#548235',
    },
    {
      sequence: 3,
      name: 'Reporting',
      keyActivities: 'Finalise strategy, operating model and implementation roadmap.',
      deliverables: 'Integrated Physical Security Strategy and implementation plan.',
      startWeek: 15,
      endWeek: 18,
      color: '#BF8F00',
    },
  ];
}

export function defaultEadFeeLineItems(rates: ProposalFeeDefaults): ProposalFeeLineItem[] {
  return [
    {
      id: 'phase-1',
      phase: '1',
      description: 'Information Gathering and Assessment',
      hours: 80,
      rate: rates.analystHourlyRate,
      fee: 80 * rates.analystHourlyRate,
      sequence: 1,
    },
    {
      id: 'phase-2',
      phase: '2',
      description: 'Define Target State',
      hours: 60,
      rate: rates.specialistHourlyRate,
      fee: 60 * rates.specialistHourlyRate,
      sequence: 2,
    },
    {
      id: 'phase-3',
      phase: '3',
      description: 'Reporting and Executive Briefing',
      hours: 40,
      rate: rates.specialistHourlyRate,
      fee: 40 * rates.specialistHourlyRate,
      sequence: 3,
    },
  ];
}

export function defaultTimelineFromPhases(phases: ProposalPhase[]): ProposalTimelineRow[] {
  return phases.map((p) => ({
    name: p.name,
    startWeek: p.startWeek || p.sequence,
    endWeek: p.endWeek || p.sequence + 2,
    sequence: p.sequence,
  }));
}

export function defaultTimelineNarrative(minWeeks = 11): string {
  return (
    `We estimate the project to run for a minimum of ${minWeeks} weeks, including any updates required to the report. ` +
    'Interviews, workshops and walk-through activities will run concurrently where possible. Our timeline is highly dependent on key resources being available to attend the workshops or meetings and providing the information required to populate the assessments as and when scheduled by Physical Risk. Our proposed timeline is illustrated below:'
  );
}

export function defaultMethodologyItems() {
  return [
    { name: 'Strategy Development', description: 'Aligning security strategy with business objectives and risk appetite.' },
    { name: 'Risk and Threat Assessment', description: 'Structured identification and evaluation of security risks and threats.' },
    { name: 'Total Security Management', description: 'Integrated management of people, process, technology and governance.' },
  ];
}

export function defaultTsmRows() {
  return [
    { area: 'Best Practices', description: 'Application of recognised industry and regulatory best practice.' },
    { area: 'Situational Awareness', description: 'Understanding of the operating environment and threat landscape.' },
    { area: 'Readiness', description: 'Preparedness to respond to incidents and disruptions.' },
    { area: 'Outreach', description: 'Stakeholder engagement and communication programmes.' },
    { area: 'Fixed Asset Management', description: 'Protection of fixed physical assets and infrastructure.' },
    { area: 'Assets in Transit Management', description: 'Security controls for assets in transit.' },
    { area: 'Intellectual Assets Management', description: 'Protection of intellectual property and sensitive information.' },
    { area: 'Human Capital Management', description: 'Personnel security, vetting and awareness.' },
    { area: 'Brand Equity / Goodwill', description: 'Protection of organisational reputation.' },
    { area: 'Assessments and Plans', description: 'Documented assessments, plans and review cycles.' },
    { area: 'Communication and Technology', description: 'Integrated communication and technology controls.' },
    { area: 'Governance', description: 'Executive oversight, accountability and assurance.' },
  ];
}

export function defaultProjectExclusions(productCode: string): string[] {
  if (productCode === 'INTEGRATED_PHYSICAL_SECURITY_STRATEGY') {
    return [
      'Documentation of SOPs or procedures',
      'Documentation of the current AS IS state beyond agreed scope',
      'Implementation of Strategy',
      'Training programmes beyond agreed awareness sessions',
    ];
  }
  return [
    'Implementation of recommended remedial actions',
    'Third-party audit or certification',
    'Legal review of contracts',
  ];
}

export const BUILTIN_TEMPLATES = [
  {
    name: 'Executive Advisory Diagnostic',
    productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
    titleTemplate: 'Executive Advisory Diagnostic',
    subtitleTemplate: 'Independent executive assurance review',
    understandingNeedsTemplate:
      '{{CLIENT_COMPANY}} requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage ({{TRIAGE_REFERENCE}}). Physical Risk will assess governance effectiveness, provider accountability and decision-useful reporting across the agreed scope.',
    objectiveTemplate:
      'To provide the executive team with an independent diagnostic of assurance posture, provider accountability and governance effectiveness, with decision-ready recommendations.',
    scopeTemplate:
      '• The engagement will cover the agreed sites or business units and executive assurance domains identified during triage.\n' +
      '• Structured review across governance, provider accountability, and executive reporting arrangements.',
    approachTemplate:
      'Taking into consideration {{CLIENT_COMPANY}}\'s requirements, Physical Risk proposes the following approach:\n\n' +
      '• An information gathering and discovery phase to establish the current state.\n' +
      '• Analysis and definition of the target assurance posture (TO BE state).\n' +
      '• Workshops to ratify draft findings and recommendations.\n' +
      '• Presentation of the final executive diagnostic report for sign-off.',
    deliverablesTemplate:
      'Executive Advisory Diagnostic report, executive briefing pack, and recommendation on Level 3 focused assurance where warranted.',
    exclusionsTemplate: 'Implementation of recommendations, statutory audit, and certification.',
    assumptionTemplate:
      'Client stakeholders will be available for interviews. Fees exclude VAT unless stated. Expenses billed at cost subject to agreed ceilings.',
    responsibilityTemplate:
      'This assessment is point-in-time and scope-bound. Deliverables are prepared solely for {{CLIENT_COMPANY}}. Third parties may not rely on this work. This is not certification or a representation of the entire universe of security risk.',
    termsTemplate:
      'Standard Physical Risk terms and conditions of service apply. Payment terms: {{PAYMENT_TERMS}}. Proposal valid until {{VALID_UNTIL}}.',
    acceptanceTemplate:
      'Should Physical Risk Consultancy be the selected as the service provider, please indicate acceptance of this proposal through signature of the proposal acceptance below.',
    feeDefaults: {
      analystHourlyRate: DEFAULT_ANALYST_RATE,
      specialistHourlyRate: DEFAULT_SPECIALIST_RATE,
      vatRate: DEFAULT_VAT_RATE,
      currency: 'ZAR',
      paymentTerms: '50% on acceptance, 50% on delivery of final report',
      mileageRate: 4.5,
      expenseBillingMethod: 'ACTUAL_COST',
    },
    defaultPhases: defaultEadPhases(),
  },
  {
    name: 'Integrated Physical Security Strategy',
    productCode: 'INTEGRATED_PHYSICAL_SECURITY_STRATEGY',
    titleTemplate: 'Development of an Integrated Physical Security Strategy',
    subtitleTemplate: 'Strategic security advisory engagement',
    understandingNeedsTemplate:
      '{{CLIENT_COMPANY}} seeks to develop an integrated physical security strategy aligned to its operational footprint and risk profile.',
    objectiveTemplate:
      'To develop an integrated Physical Security Strategy, a Physical Security Operating Model, and an Implementation Plan / Road Map for {{CLIENT_COMPANY}}.',
    scopeTemplate:
      '• Phase 1: Gathering information for the review and assessment of the security environment and risk profile.\n' +
      '• Phase 2: Developing an integrated Physical Security Strategy and Operating Model.\n' +
      '• Phase 3: Reporting with recommendations for implementation.\n\n' +
      'The scope includes the following security services and functions:\n' +
      '• **Physical Security (PS):** Security guards deployed at various categories of premises.\n' +
      '• **Network Protection Service (NPS):** Infrastructure protection, investigations and related services.\n' +
      '• **Dedicated Armed Escorting (DAE):** Armed personnel to escort technicians.\n' +
      '• **Ad Hoc (AH):** Armed escorts for vandalized sites and generators.\n' +
      '• **Armed Response (AR):** Building alarms and related response services.',
    approachTemplate:
      'Taking into consideration {{CLIENT_COMPANY}}\'s requirements, Physical Risk proposes the following approach:\n\n' +
      '• An information gathering and discovery phase to establish the current state.\n' +
      '• Provision of the TO BE state/model and integrated strategy deliverables.\n' +
      '• Workshops to ratify draft deliverables with key stakeholders.\n' +
      '• Presentation of the final executive report for sign-off.',
    deliverablesTemplate:
      'Integrated Physical Security Strategy, Physical Security Operating Model, and Implementation Plan / Road Map.',
    exclusionsTemplate: 'SOP documentation, full AS IS documentation beyond agreed scope, strategy implementation, training.',
    assumptionTemplate:
      'Management sponsorship and stakeholder availability. Travel and accommodation at cost where required.',
    responsibilityTemplate:
      'Point-in-time assessment within defined scope for {{CLIENT_COMPANY}} only. Not certification.',
    termsTemplate: 'Physical Risk standard terms apply. Payment per agreed schedule.',
    acceptanceTemplate: 'Acceptance by authorised representative of {{CLIENT_COMPANY}}.',
    feeDefaults: {
      analystHourlyRate: DEFAULT_ANALYST_RATE,
      specialistHourlyRate: DEFAULT_SPECIALIST_RATE,
      vatRate: DEFAULT_VAT_RATE,
      currency: 'ZAR',
      paymentTerms: 'Monthly in arrears against agreed milestones',
    },
    defaultPhases: defaultStrategyPhases(),
  },
];

export function buildPlaceholderMap(input: {
  clientCompany: string;
  clientContact: string;
  clientPosition?: string | null;
  proposalNumber: string;
  proposalDate: string;
  proposalVersion: number;
  proposalTitle: string;
  triageReference?: string | null;
  paymentTerms?: string | null;
  validUntil?: string | null;
  leadConsultant?: string | null;
}): ProposalPlaceholderMap {
  return {
    CLIENT_COMPANY: input.clientCompany,
    CLIENT_CONTACT: input.clientContact,
    CLIENT_POSITION: input.clientPosition || '',
    PROPOSAL_NUMBER: input.proposalNumber,
    PROPOSAL_DATE: input.proposalDate,
    PROPOSAL_VERSION: String(input.proposalVersion),
    PROPOSAL_TITLE: input.proposalTitle,
    TRIAGE_REFERENCE: input.triageReference || '',
    PAYMENT_TERMS: input.paymentTerms || '',
    VALID_UNTIL: input.validUntil || '',
    LEAD_CONSULTANT: input.leadConsultant || '',
  };
}

function pickNonEmptyArray<T>(incoming: T[], existing: T[]): T[] {
  return incoming.length ? incoming : existing;
}

export function mergeContentSnapshot(
  existing: ProposalContentSnapshot,
  incoming: ProposalContentSnapshot,
): ProposalContentSnapshot {
  return {
    phases: pickNonEmptyArray(incoming.phases, existing.phases),
    feeLineItems: pickNonEmptyArray(incoming.feeLineItems, existing.feeLineItems),
    timelineRows: pickNonEmptyArray(incoming.timelineRows, existing.timelineRows),
    teamMembers: pickNonEmptyArray(incoming.teamMembers, existing.teamMembers),
    experienceItems: pickNonEmptyArray(incoming.experienceItems, existing.experienceItems),
    methodologyItems: pickNonEmptyArray(incoming.methodologyItems, existing.methodologyItems),
    deliverableSections: pickNonEmptyArray(incoming.deliverableSections, existing.deliverableSections),
    projectExclusions: pickNonEmptyArray(incoming.projectExclusions, existing.projectExclusions),
    feeAssumptions: pickNonEmptyArray(incoming.feeAssumptions, existing.feeAssumptions),
    acceptance: incoming.acceptance ?? existing.acceptance,
  };
}

export function readContentSnapshot(value: unknown): ProposalContentSnapshot {
  const empty: ProposalContentSnapshot = {
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
  if (!value || typeof value !== 'object') return empty;
  const v = value as Partial<ProposalContentSnapshot>;
  return {
    phases: Array.isArray(v.phases) ? v.phases : [],
    feeLineItems: Array.isArray(v.feeLineItems) ? v.feeLineItems : [],
    timelineRows: Array.isArray(v.timelineRows) ? v.timelineRows : [],
    teamMembers: Array.isArray(v.teamMembers) ? v.teamMembers : [],
    experienceItems: Array.isArray(v.experienceItems) ? v.experienceItems : [],
    methodologyItems: Array.isArray(v.methodologyItems) ? v.methodologyItems : [],
    deliverableSections: Array.isArray(v.deliverableSections) ? v.deliverableSections : [],
    projectExclusions: Array.isArray(v.projectExclusions) ? v.projectExclusions : [],
    feeAssumptions: Array.isArray(v.feeAssumptions) ? v.feeAssumptions : [],
    acceptance: v.acceptance,
  };
}
