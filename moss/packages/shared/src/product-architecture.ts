export type PhysicalRiskLevel = 1 | 2 | 3;

export const PHYSICAL_RISK_PRODUCTS = {
  EXECUTIVE_GOVERNANCE_TRIAGE: {
    level: 1 as PhysicalRiskLevel,
    name: 'Executive Governance Triage',
    kind: 'questionnaire',
    paid: false,
    purpose: 'Complimentary executive questionnaire for lead qualification, warning indicators and product routing.',
  },
  EXECUTIVE_ADVISORY_DIAGNOSTIC: {
    level: 2 as PhysicalRiskLevel,
    name: 'Executive Advisory Diagnostic',
    kind: 'diagnostic',
    paid: true,
    purpose: 'Consultant-led, evidence-based diagnostic that establishes governance, financial, contractual, reporting and operational exposure.',
  },
  SCLI_COST_LEAKAGE: {
    level: 3 as PhysicalRiskLevel,
    name: 'Security Cost Leakage Assessment™',
    kind: 'focused-assurance',
    paid: true,
  },
  CONTRACT_SLA_ASSURANCE: {
    level: 3 as PhysicalRiskLevel,
    name: 'Contract and Service-Level Agreement Assurance Review',
    kind: 'focused-assurance',
    paid: true,
  },
  VENDOR_PERFORMANCE_ASSURANCE: {
    level: 3 as PhysicalRiskLevel,
    name: 'Vendor Performance Assurance Review',
    kind: 'focused-assurance',
    paid: true,
  },
  GOVERNANCE_EXECUTIVE_ASSURANCE: {
    level: 3 as PhysicalRiskLevel,
    name: 'Security Governance and Executive Assurance Review',
    kind: 'focused-assurance',
    paid: true,
  },
  CYBER_PHYSICAL_DEPENDENCY: {
    level: 3 as PhysicalRiskLevel,
    name: 'Cyber-Physical Dependency Review',
    kind: 'focused-assurance',
    paid: true,
  },
  SHIELD360: {
    level: 3 as PhysicalRiskLevel,
    name: 'Shield 360',
    kind: 'sustainable-solution',
    paid: true,
  },
} as const;

export const EXECUTIVE_ADVISORY_MODULES = [
  { code: 'GOVERNANCE', name: 'Governance and accountability', principalQuestion: 'Is responsibility assigned, exercised and independently tested?' },
  { code: 'FINANCIAL', name: 'Financial assurance', principalQuestion: 'Is expenditure traceable to justified and received value?' },
  { code: 'CONTRACTUAL', name: 'Contractual assurance', principalQuestion: 'Are obligations measurable, monitored and enforceable?' },
  { code: 'REPORTING', name: 'Reporting integrity', principalQuestion: 'Is executive information complete, reliable and decision-useful?' },
  { code: 'RESILIENCE', name: 'Operational resilience', principalQuestion: 'Could service or technology dependencies fail without adequate warning?' },
  { code: 'CONSEQUENCE', name: 'Consequence management', principalQuestion: 'Do failures lead to correction, recovery, penalties or escalation?' },
] as const;

export const FOCUSED_ASSURANCE_PRODUCTS = [
  { code: 'SCLI_COST_LEAKAGE', name: PHYSICAL_RISK_PRODUCTS.SCLI_COST_LEAKAGE.name, buyer: 'Chief Financial Officer' },
  { code: 'CONTRACT_SLA_ASSURANCE', name: PHYSICAL_RISK_PRODUCTS.CONTRACT_SLA_ASSURANCE.name, buyer: 'Procurement / Risk / Legal / Operations' },
  { code: 'VENDOR_PERFORMANCE_ASSURANCE', name: PHYSICAL_RISK_PRODUCTS.VENDOR_PERFORMANCE_ASSURANCE.name, buyer: 'COO / Procurement / Security Executive' },
  { code: 'GOVERNANCE_EXECUTIVE_ASSURANCE', name: PHYSICAL_RISK_PRODUCTS.GOVERNANCE_EXECUTIVE_ASSURANCE.name, buyer: 'Audit or Governance Committee' },
  { code: 'CYBER_PHYSICAL_DEPENDENCY', name: PHYSICAL_RISK_PRODUCTS.CYBER_PHYSICAL_DEPENDENCY.name, buyer: 'COO / CIO / Security Executive' },
] as const;

export const FOCUSED_ASSURANCE_MODULES: Record<string, ReadonlyArray<{code:string;name:string;principalQuestion:string}>> = {
  CONTRACT_SLA_ASSURANCE: [
    { code:'SCOPE', name:'Scope and deliverables', principalQuestion:'Are scope and deliverables clear, measurable and governable?' },
    { code:'SERVICE_LEVELS', name:'Service levels and KPIs', principalQuestion:'Are service levels and performance indicators measurable?' },
    { code:'INVOICE', name:'Invoice substantiation', principalQuestion:'Can invoiced services be substantiated against delivered evidence?' },
    { code:'CONSEQUENCES', name:'Penalties and service credits', principalQuestion:'Are contractual consequences enforceable and used?' },
    { code:'AUDIT', name:'Evidence, audit and change control', principalQuestion:'Are evidence retention, audit rights and change control adequate?' },
    { code:'TRANSITION', name:'Escalation, termination and transition', principalQuestion:'Are escalation and transition protections operationally usable?' },
  ],
  VENDOR_PERFORMANCE_ASSURANCE: [
    { code:'REQUIREMENT', name:'Contracted requirement', principalQuestion:'What did the provider contractually commit to deliver?' },
    { code:'CLAIMED', name:'Claimed delivery', principalQuestion:'What does the provider report as delivered?' },
    { code:'VERIFIED', name:'Independently verified delivery', principalQuestion:'What delivery is independently supported by evidence?' },
    { code:'VARIANCE', name:'Variance and under-delivery', principalQuestion:'Where does verified delivery differ from contracted requirement?' },
    { code:'FINANCIAL', name:'Financial consequence', principalQuestion:'What invoice, penalty, service-credit or recovery consequence follows?' },
    { code:'ESCALATION', name:'Corrective action and escalation', principalQuestion:'What corrective action and executive escalation is required?' },
  ],
  GOVERNANCE_EXECUTIVE_ASSURANCE: [
    { code:'MANDATE', name:'Governance mandate and oversight', principalQuestion:'Is security governed with a clear executive and committee mandate?' },
    { code:'ACCOUNTABILITY', name:'Accountability and risk ownership', principalQuestion:'Are risk ownership and accountability explicit and exercised?' },
    { code:'POLICY', name:'Policy and control architecture', principalQuestion:'Is the policy/control architecture coherent and decision-useful?' },
    { code:'INFORMATION', name:'Management information and reporting integrity', principalQuestion:'Can executive reporting be relied upon?' },
    { code:'ASSURANCE', name:'Independent assurance and exception management', principalQuestion:'Are material exceptions independently challenged and tracked?' },
    { code:'CONSEQUENCE', name:'Budget, contract and consequence management', principalQuestion:'Do failures result in accountable correction and consequence management?' },
  ],
  CYBER_PHYSICAL_DEPENDENCY: [
    { code:'POWER', name:'Power dependencies', principalQuestion:'Could electrical failure disable physical-security outcomes?' },
    { code:'COMMS', name:'Communications and network dependencies', principalQuestion:'Could communications or network failure disable security operations?' },
    { code:'IDENTITY', name:'Access, identity and cloud dependencies', principalQuestion:'Could identity or cloud-system failure compromise physical protection?' },
    { code:'SURVEILLANCE', name:'Surveillance and control-room dependencies', principalQuestion:'Are surveillance and control-room dependencies resilient?' },
    { code:'PROVIDERS', name:'Maintenance and provider dependencies', principalQuestion:'Could provider failure create a material single point of failure?' },
    { code:'PROCESS', name:'Operational process resilience', principalQuestion:'Are fallback operating processes defined, tested and owned?' },
  ],
  SHIELD360: [
    { code:'DEPLOYMENT', name:'Deployment verification', principalQuestion:'Are personnel and supervisors verifiably present at required locations?' },
    { code:'PATROLS', name:'Patrol and activity verification', principalQuestion:'Are patrols independently evidenced using location and checkpoint records?' },
    { code:'EVIDENCE', name:'Operational evidence', principalQuestion:'Are time, location, image and activity records retained as decision-grade evidence?' },
    { code:'SLA', name:'SLA consequence automation', principalQuestion:'Can verified service failures drive defensible penalties or service credits?' },
    { code:'INVOICE', name:'Invoice reconciliation', principalQuestion:'Can verified performance be reconciled to vendor invoicing?' },
    { code:'GOVERNANCE', name:'Executive oversight', principalQuestion:'Does continuous evidence support governance, audit and management oversight?' },
  ],
};
