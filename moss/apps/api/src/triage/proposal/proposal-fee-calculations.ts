import type { ProposalFeeLineItem } from './proposal-template-types';

export type FeeCalculationInput = {
  lineItems: ProposalFeeLineItem[];
  discount?: number;
  vatRate?: number;
  expensesEstimate?: number;
};

export type FeeCalculationResult = {
  subtotal: number;
  discountedSubtotal: number;
  vatAmount: number;
  grandTotal: number;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateProposalFees(input: FeeCalculationInput): FeeCalculationResult {
  const subtotal = roundMoney(
    input.lineItems.reduce((sum, row) => sum + (Number(row.fee) || 0), 0),
  );
  const discount = roundMoney(Math.max(0, Number(input.discount) || 0));
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const vatRate = Number(input.vatRate) || 0;
  const vatAmount = roundMoney(discountedSubtotal * vatRate);
  const expenses = roundMoney(Number(input.expensesEstimate) || 0);
  const grandTotal = roundMoney(discountedSubtotal + vatAmount + expenses);
  return { subtotal, discountedSubtotal, vatAmount, grandTotal };
}

export function formatProposalMoney(amount: number, currency = 'ZAR'): string {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency === 'R' ? 'ZAR' : currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-ZA')}`;
  }
}

export function recalculateLineItemFee(item: ProposalFeeLineItem): ProposalFeeLineItem {
  if (item.hours != null && item.rate != null) {
    return { ...item, fee: roundMoney(Number(item.hours) * Number(item.rate)) };
  }
  return item;
}

export function recalculateAllLineItems(items: ProposalFeeLineItem[]): ProposalFeeLineItem[] {
  return items.map(recalculateLineItemFee);
}
