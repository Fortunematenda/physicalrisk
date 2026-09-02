import { describe, expect, it } from 'vitest';
import {
  calculateProposalFees,
  formatProposalMoney,
  recalculateAllLineItems,
  roundMoney,
} from './proposal-fee-calculations';
import type { ProposalFeeLineItem } from './proposal-template-types';

describe('proposal fee calculations', () => {
  const lineItems: ProposalFeeLineItem[] = [
    { id: '1', phase: '1', description: 'Phase 1', hours: 80, rate: 985, fee: 78800, sequence: 1 },
    { id: '2', phase: '2', description: 'Phase 2', hours: 60, rate: 1825, fee: 109500, sequence: 2 },
  ];

  it('sums line items into subtotal', () => {
    const result = calculateProposalFees({ lineItems, discount: 0, vatRate: 0.15, expensesEstimate: 0 });
    expect(result.subtotal).toBe(188300);
  });

  it('applies discount before VAT', () => {
    const result = calculateProposalFees({
      lineItems,
      discount: 10000,
      vatRate: 0.15,
      expensesEstimate: 5000,
    });
    expect(result.discountedSubtotal).toBe(178300);
    expect(result.vatAmount).toBe(roundMoney(178300 * 0.15));
    expect(result.grandTotal).toBe(roundMoney(178300 * 1.15 + 5000));
  });

  it('recalculates hours × rate fees', () => {
    const recalced = recalculateAllLineItems([
      { id: 'x', phase: '1', description: 'Test', hours: 10, rate: 985, fee: 0, sequence: 1 },
    ]);
    expect(recalced[0].fee).toBe(9850);
  });

  it('formats ZAR currency', () => {
    expect(formatProposalMoney(150000, 'ZAR')).toMatch(/150/);
  });
});
