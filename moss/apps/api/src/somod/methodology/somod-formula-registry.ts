/**
 * Governed formula registry types (P0 architecture).
 * Do not populate RISK / DEPLOYMENT / TECHNOLOGY / OPTIMISATION expressions
 * until client methodology is approved. Financial penalty formulas remain
 * in SomodPenaltyLibrary with METHODOLOGY_ADMIN edit control.
 */

export type SomodFormulaCategory =
  | 'FINANCIAL'
  | 'PENALTY'
  | 'RISK'
  | 'DEPLOYMENT'
  | 'TECHNOLOGY'
  | 'OPTIMISATION';

export type SomodFormulaStatus =
  | 'UNCONFIGURED'
  | 'DRAFT'
  | 'APPROVED'
  | 'RETIRED';

export type SomodFormulaDefinition = {
  id: string;
  code: string;
  name: string;
  category: SomodFormulaCategory;
  expression: string | null;
  requiredVariables: string[];
  version: number;
  status: SomodFormulaStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Slots that exist architecturally but must not invent expressions. */
export const UNCONFIGURED_METHODOLOGY_FORMULA_SLOTS: Array<
  Pick<SomodFormulaDefinition, 'code' | 'name' | 'category' | 'status' | 'expression'>
> = [
  {
    code: 'RISK_REQUIREMENT_DERIVATION',
    name: 'Risk & requirement derivation',
    category: 'RISK',
    status: 'UNCONFIGURED',
    expression: null,
  },
  {
    code: 'DEPLOYMENT_DERIVATION',
    name: 'Deployment derivation',
    category: 'DEPLOYMENT',
    status: 'UNCONFIGURED',
    expression: null,
  },
  {
    code: 'TECHNOLOGY_SUBSTITUTION',
    name: 'Technology substitution',
    category: 'TECHNOLOGY',
    status: 'UNCONFIGURED',
    expression: null,
  },
  {
    code: 'OPTIMISATION_OBJECTIVE',
    name: 'Optimisation objective',
    category: 'OPTIMISATION',
    status: 'UNCONFIGURED',
    expression: null,
  },
];
