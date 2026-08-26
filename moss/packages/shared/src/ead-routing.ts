/** Level 3 routing priority confirmed at EAD completion. */
export const ADVISORY_ROUTE_PRIORITIES = ['HIGH', 'RECOMMENDED', 'OPTIONAL'] as const;
export type AdvisoryRoutePriority = (typeof ADVISORY_ROUTE_PRIORITIES)[number];

export const ADVISORY_ROUTE_PRIORITY_LABELS: Record<AdvisoryRoutePriority, string> = {
  HIGH: 'High priority',
  RECOMMENDED: 'Recommended',
  OPTIONAL: 'Optional',
};

/** Level 3 products selectable from EAD routing (excludes EAD itself). */
export const EAD_ROUTING_PRODUCT_CODES = [
  'SCLI_COST_LEAKAGE',
  'CONTRACT_SLA_ASSURANCE',
  'VENDOR_PERFORMANCE_ASSURANCE',
  'GOVERNANCE_EXECUTIVE_ASSURANCE',
  'CYBER_PHYSICAL_DEPENDENCY',
  'SHIELD360',
] as const;

export type EadRoutingProductCode = (typeof EAD_ROUTING_PRODUCT_CODES)[number];

export const L3_COMMERCIAL_ACTIONS = [
  'INITIATE',
  'PREPARE',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRE',
  'CANCELLED',
] as const;
