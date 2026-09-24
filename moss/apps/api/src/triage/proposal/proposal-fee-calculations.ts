import type {
  ProposalExpenseLineItem,
  ProposalFeeLineItem,
} from './proposal-template-types';

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

/** Accept 0.15 or 15 (percent) — values above 1 are treated as whole-number percents. */
export function normalizeVatRate(raw: number | string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return n / 100;
  return n;
}

function finiteOrNull(value: unknown): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function hasDualRoleFields(item: ProposalFeeLineItem): boolean {
  return (
    item.dataAnalystHours != null
    || item.dataAnalystRate != null
    || item.specialistHours != null
    || item.specialistRate != null
  );
}

/**
 * Normalise a fee row for dual analyst/specialist rates.
 * Legacy rows (hours + rate only) map onto Data Analyst fields so existing data is preserved.
 */
export function normalizeFeeLineItem(item: ProposalFeeLineItem): ProposalFeeLineItem {
  let dataAnalystHours = finiteOrNull(item.dataAnalystHours);
  let dataAnalystRate = finiteOrNull(item.dataAnalystRate);
  let specialistHours = finiteOrNull(item.specialistHours);
  let specialistRate = finiteOrNull(item.specialistRate);

  if (!hasDualRoleFields(item)) {
    dataAnalystHours = finiteOrNull(item.hours);
    dataAnalystRate = finiteOrNull(item.rate);
  }

  const aH = dataAnalystHours ?? 0;
  const aR = dataAnalystRate ?? 0;
  const sH = specialistHours ?? 0;
  const sR = specialistRate ?? 0;
  const hasAnyRoleInput =
    dataAnalystHours != null
    || dataAnalystRate != null
    || specialistHours != null
    || specialistRate != null
    || item.hours != null
    || item.rate != null;

  const fee = hasAnyRoleInput
    ? roundMoney(aH * aR + sH * sR)
    : roundMoney(Number(item.fee) || 0);

  const totalHours = aH + sH;
  const legacyHours = totalHours > 0 ? roundMoney(totalHours) : finiteOrNull(item.hours);
  const legacyRate =
    totalHours > 0
      ? roundMoney(fee / totalHours)
      : dataAnalystRate ?? specialistRate ?? finiteOrNull(item.rate);

  return {
    ...item,
    dataAnalystHours,
    dataAnalystRate,
    specialistHours,
    specialistRate,
    hours: legacyHours,
    rate: legacyRate,
    fee,
  };
}

export function recalculateLineItemFee(item: ProposalFeeLineItem): ProposalFeeLineItem {
  return normalizeFeeLineItem(item);
}

export function recalculateAllLineItems(items: ProposalFeeLineItem[]): ProposalFeeLineItem[] {
  return items.map(recalculateLineItemFee);
}

export function recalculateExpenseLine(item: ProposalExpenseLineItem): ProposalExpenseLineItem {
  const quantity = finiteOrNull(item.quantity);
  const unitCharge = finiteOrNull(item.unitCharge);
  const total =
    quantity != null && unitCharge != null
      ? roundMoney(quantity * unitCharge)
      : roundMoney(Number(item.total) || 0);
  return {
    ...item,
    description: String(item.description || '').trim(),
    unit: String(item.unit || '').trim(),
    quantity,
    unitCharge,
    total,
  };
}

export function recalculateAllExpenseLines(
  items: ProposalExpenseLineItem[] | null | undefined,
): ProposalExpenseLineItem[] {
  return (items || []).map(recalculateExpenseLine);
}

export function sumExpenseLines(items: ProposalExpenseLineItem[] | null | undefined): number {
  return roundMoney(
    recalculateAllExpenseLines(items).reduce((sum, row) => sum + (Number(row.total) || 0), 0),
  );
}

/**
 * Resolve whether expenses contribute to totals, and the amount to use.
 * Legacy proposals with only expensesEstimate (no lines) keep that amount when included.
 */
export function resolveIncludedExpenses(opts: {
  includeExpenses?: boolean | null;
  expenseLineItems?: ProposalExpenseLineItem[] | null;
  expensesEstimate?: number | null;
}): { include: boolean; total: number; lines: ProposalExpenseLineItem[] } {
  const lines = recalculateAllExpenseLines(opts.expenseLineItems);
  const legacyEstimate = roundMoney(Number(opts.expensesEstimate) || 0);
  const hasLines = lines.length > 0;
  const include =
    opts.includeExpenses != null
      ? Boolean(opts.includeExpenses)
      : hasLines || legacyEstimate > 0;

  if (!include) {
    return { include: false, total: 0, lines };
  }
  if (hasLines) {
    return { include: true, total: sumExpenseLines(lines), lines };
  }
  return { include: true, total: legacyEstimate, lines };
}

export function calculateProposalFees(input: FeeCalculationInput): FeeCalculationResult {
  const lineItems = recalculateAllLineItems(input.lineItems || []);
  const subtotal = roundMoney(
    lineItems.reduce((sum, row) => sum + (Number(row.fee) || 0), 0),
  );
  const discount = roundMoney(Math.max(0, Number(input.discount) || 0));
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount));
  const vatRate = normalizeVatRate(input.vatRate);
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
