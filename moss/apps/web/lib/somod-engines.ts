export type SomodEngineKey =
  | 'RISK_REQUIREMENT'
  | 'DEPLOYMENT_CAPABILITY'
  | 'TECHNOLOGY'
  | 'COST_EFFICIENCY'
  | 'OPTIMISATION_TRADEOFF';

export type EngineAvailability = 'available' | 'configuration_required' | 'not_implemented';

export type SomodEngineCapability = {
  key: SomodEngineKey;
  name: string;
  availability: EngineAvailability;
  statusLabel: string;
  explanation: string;
};

/**
 * What each engine really does in this release. Only Deployment and Cost / Efficiency inputs feed
 * a governed calculation (Current scenario); the others capture inputs or notes until the client
 * methodology is approved (see METHODOLOGY_REQUIRED in the API engine readiness).
 */
export const SOMOD_ENGINE_CAPABILITIES: readonly SomodEngineCapability[] = [
  {
    key: 'RISK_REQUIREMENT',
    name: 'Risk / Requirement',
    availability: 'configuration_required',
    statusLabel: 'Configuration required',
    explanation:
      'Records threat, asset and requirement notes. Risk scoring needs approved methodology before it produces results.',
  },
  {
    key: 'DEPLOYMENT_CAPABILITY',
    name: 'Deployment / Capability',
    availability: 'available',
    statusLabel: 'Available',
    explanation: 'Headcount and supervisor numbers drive the Current scenario manpower cost.',
  },
  {
    key: 'TECHNOLOGY',
    name: 'Technology',
    availability: 'configuration_required',
    statusLabel: 'Configuration required',
    explanation:
      'Records systems and costs for reference. Calculations take technology cost from Financial setup; substitution analysis needs approved methodology.',
  },
  {
    key: 'COST_EFFICIENCY',
    name: 'Cost / Efficiency',
    availability: 'available',
    statusLabel: 'Available',
    explanation:
      'Missed shifts, missed patrols and response delay drive Current scenario penalties and leakage.',
  },
  {
    key: 'OPTIMISATION_TRADEOFF',
    name: 'Optimisation / Trade-off',
    availability: 'not_implemented',
    statusLabel: 'Not yet implemented',
    explanation:
      'Notes only. Recommended Optimal results need an approved optimisation objective and constraints.',
  },
];

export function engineCapability(key: string): SomodEngineCapability | undefined {
  return SOMOD_ENGINE_CAPABILITIES.find((engine) => engine.key === key);
}

export function availabilityBadgeClass(availability?: EngineAvailability): string {
  if (availability === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (availability === 'configuration_required') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

/** Fields the API stores as numbers; everything else is free text and must be sent as text. */
const NUMERIC_ENGINE_FIELDS = new Set([
  'headcount',
  'supervisorCount',
  'technologyCapex',
  'technologyMonthlyOpex',
  'missedShifts',
  'missedPatrols',
  'responseDelayMinutes',
]);

export function enginePayload(form: Record<string, string>): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(form)) {
    if (!NUMERIC_ENGINE_FIELDS.has(key)) {
      payload[key] = value;
      continue;
    }
    const trimmed = String(value ?? '').trim();
    const n = Number(trimmed);
    payload[key] = trimmed === '' || !Number.isFinite(n) ? null : n;
  }
  return payload;
}

export type WorkspacePanel = 'engines' | 'financial' | 'summary';

/** Reads ?panel=engines&engine=COST_EFFICIENCY so engine workspaces can be linked directly. */
export function workspaceQuery(params: { get(name: string): string | null } | null): {
  panel: WorkspacePanel | null;
  engine: SomodEngineKey | null;
} {
  const panel = params?.get('panel');
  const engine = params?.get('engine')?.toUpperCase() ?? null;
  return {
    panel: panel === 'engines' || panel === 'financial' || panel === 'summary' ? panel : null,
    engine: engine && engineCapability(engine) ? (engine as SomodEngineKey) : null,
  };
}

export function engineWorkspaceHref(assessmentId: string, engine: SomodEngineKey): string {
  return `/somod/assessments/${encodeURIComponent(assessmentId)}?panel=engines&engine=${engine}`;
}
