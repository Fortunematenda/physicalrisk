import type { PhysicalRiskProposalInput } from './proposal-template-types';
import { stripHtmlToPlain } from './proposal-rich-text';

export type ProposalValidationIssue = {
  field: string;
  message: string;
  blocking: boolean;
};

export function validateProposalForSend(input: PhysicalRiskProposalInput): ProposalValidationIssue[] {
  const issues: ProposalValidationIssue[] = [];
  const req = (field: string, value: unknown, label: string) => {
    const plain = stripHtmlToPlain(String(value ?? ''));
    if (!plain) {
      issues.push({ field, message: `${label} is required.`, blocking: true });
    }
  };

  req('clientCompany', input.clientCompany, 'Client organisation');
  req('clientContact', input.clientContact, 'Primary contact');
  req('proposalTitle', input.proposalTitle, 'Proposal title');
  req('proposalNumber', input.proposalNumber, 'Proposal number');
  req('objectives', input.objectives, 'Objectives');
  req('scope', input.scope, 'Scope');
  req('deliverables', input.deliverables, 'Deliverables');
  req('understandingOfNeeds', input.understandingOfNeeds, 'Understanding your needs');
  req('termsAndConditions', input.termsAndConditions, 'Terms and conditions');
  req('acceptanceTerms', input.acceptanceTerms, 'Acceptance terms');
  req('paymentTerms', input.paymentTerms, 'Payment terms');

  if (!input.content.phases.length) {
    issues.push({ field: 'phases', message: 'At least one project phase is required.', blocking: true });
  }
  if (!input.content.feeLineItems.length) {
    issues.push({ field: 'feeLineItems', message: 'Fee line items are required.', blocking: true });
  }
  if (input.feeTotals.grandTotal <= 0) {
    issues.push({ field: 'feeTotals', message: 'Proposal total must be greater than zero.', blocking: true });
  }
  if (!input.preparedByName?.trim()) {
    issues.push({ field: 'preparedByName', message: 'Prepared by / project manager is recommended.', blocking: false });
  }

  const leakPattern = /\{\{[A-Z0-9_]+\}\}|undefined|null|\[object Object\]/i;
  const textFields: Array<[string, string]> = [
    ['understandingOfNeeds', input.understandingOfNeeds],
    ['objectives', input.objectives],
    ['scope', input.scope],
    ['deliverables', input.deliverables],
    ['termsAndConditions', input.termsAndConditions],
  ];
  for (const [field, text] of textFields) {
    if (leakPattern.test(text)) {
      issues.push({ field, message: 'Unresolved placeholder or invalid value in document text.', blocking: true });
    }
  }

  return issues;
}

export function canMarkReadyToSend(input: PhysicalRiskProposalInput): boolean {
  return validateProposalForSend(input).every((i) => !i.blocking);
}
