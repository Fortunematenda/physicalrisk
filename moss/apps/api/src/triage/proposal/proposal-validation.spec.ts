import { describe, expect, it } from 'vitest';
import { validateProposalForSend } from './proposal-validation';
import type { PhysicalRiskProposalInput } from './proposal-template-types';

function minimalInput(overrides: Partial<PhysicalRiskProposalInput> = {}): PhysicalRiskProposalInput {
  return {
    proposalNumber: 'PRP-2026-000001',
    proposalVersion: 1,
    proposalDate: '31 August 2026',
    productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
    proposalTitle: 'Executive Advisory Diagnostic',
    clientCompany: 'Test Co',
    clientContact: 'Jane Doe',
    understandingOfNeeds: 'Client needs diagnostic support.',
    objectives: 'Review governance',
    scope: 'Key sites',
    approach: 'Structured diagnostic',
    methodology: 'TSM methodology',
    deliverables: 'Final report',
    exclusions: 'Implementation',
    assumptions: 'Timely access',
    statementOfResponsibility: 'Advisory only',
    termsAndConditions: 'Standard terms',
    acceptanceTerms: 'Sign and return',
    paymentTerms: '50/50',
    currency: 'ZAR',
    analystHourlyRate: 985,
    specialistHourlyRate: 1825,
    vatRate: 0.15,
    discount: 0,
    expensesEstimate: 0,
    content: {
      phases: [{ sequence: 1, name: 'Phase 1', keyActivities: 'Work', deliverables: 'Output' }],
      feeLineItems: [{ id: '1', phase: '1', description: 'Fee', fee: 100000, sequence: 1 }],
      timelineRows: [],
      teamMembers: [],
      experienceItems: [],
      methodologyItems: [],
      deliverableSections: [],
      projectExclusions: [],
      feeAssumptions: [],
    },
    feeTotals: {
      subtotal: 100000,
      discountedSubtotal: 100000,
      vatAmount: 15000,
      grandTotal: 115000,
    },
    ...overrides,
  };
}

describe('proposal validation', () => {
  it('passes when required fields are present', () => {
    const issues = validateProposalForSend(minimalInput());
    expect(issues.filter((i) => i.blocking)).toHaveLength(0);
  });

  it('blocks unresolved placeholders', () => {
    const issues = validateProposalForSend(
      minimalInput({ objectives: 'Scope for {{CLIENT_COMPANY}} remains open' }),
    );
    expect(issues.some((i) => i.blocking && i.field === 'objectives')).toBe(true);
  });

  it('blocks zero total fees', () => {
    const issues = validateProposalForSend(
      minimalInput({
        feeTotals: { subtotal: 0, discountedSubtotal: 0, vatAmount: 0, grandTotal: 0 },
        content: {
          ...minimalInput().content,
          feeLineItems: [],
        },
      }),
    );
    expect(issues.some((i) => i.field === 'feeLineItems' || i.field === 'feeTotals')).toBe(true);
  });
});
