// ============================================================================
// Money / Count helpers + input validation
// ============================================================================
import type { Money, Count } from './types';

export const ZERO_MONEY: Money = { kind: 'known', value: 0 };
export const UNKNOWN_MONEY: Money = { kind: 'unknown' };
export const UNKNOWN_COUNT: Count = { kind: 'unknown' };

export const moneyKnown = (value: number): Money => ({
  kind: 'known',
  value: Number.isFinite(value) ? value : 0,
});
export const countKnown = (value: number): Count => ({
  kind: 'known',
  value: Number.isFinite(value) ? Math.round(value) : 0,
});

export function moneyValue(m: Money | undefined, fallback = 0): number {
  if (!m) return fallback;
  return m.kind === 'known' ? m.value : fallback;
}

export function countValue(c: Count | undefined, fallback = 0): number {
  if (!c) return fallback;
  return c.kind === 'known' ? c.value : fallback;
}

export function isUnknown(m: Money | undefined): boolean {
  return !!m && m.kind === 'unknown';
}
export function isUnknownCount(c: Count | undefined): boolean {
  return !!c && c.kind === 'unknown';
}

/** INR / lakh / crore formatter used throughout the UI. */
export function inr(amount: number): string {
  if (!isFinite(amount)) return '₹0';
  const n = Math.round(amount);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function round0(n: number): number {
  return Math.round(n);
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validate(input: {
  age?: number;
  netMonthlyIncome?: Money;
  existingEmi?: Money;
  monthlyEssentials?: Money;
  requestedAmount?: Money;
  cibilScore?: number | null;
  requestedTenureMonths?: number;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input.age !== undefined && (input.age < 18 || input.age > 90)) {
    issues.push({ field: 'age', message: 'Age must be between 18 and 90.' });
  }

  if (
    input.netMonthlyIncome &&
    input.netMonthlyIncome.kind === 'known' &&
    input.netMonthlyIncome.value < 0
  ) {
    issues.push({
      field: 'netMonthlyIncome',
      message: 'Income cannot be negative.',
    });
  }

  if (
    input.existingEmi &&
    input.existingEmi.kind === 'known' &&
    input.existingEmi.value < 0
  ) {
    issues.push({
      field: 'existingEmi',
      message: 'Existing EMI cannot be negative.',
    });
  }

  if (
    input.monthlyEssentials &&
    input.monthlyEssentials.kind === 'known' &&
    input.monthlyEssentials.value < 0
  ) {
    issues.push({
      field: 'monthlyEssentials',
      message: 'Expenses cannot be negative.',
    });
  }

  if (
    input.requestedAmount &&
    input.requestedAmount.kind === 'known' &&
    input.requestedAmount.value < 0
  ) {
    issues.push({
      field: 'requestedAmount',
      message: 'Requested amount cannot be negative.',
    });
  }

  if (
    input.cibilScore !== undefined &&
    input.cibilScore !== null &&
    (input.cibilScore < 300 || input.cibilScore > 900)
  ) {
    issues.push({
      field: 'cibilScore',
      message: 'CIBIL score must be between 300 and 900.',
    });
  }

  if (
    input.requestedTenureMonths !== undefined &&
    (input.requestedTenureMonths < 3 || input.requestedTenureMonths > 360)
  ) {
    issues.push({
      field: 'requestedTenureMonths',
      message: 'Tenure must be between 3 and 360 months.',
    });
  }

  return issues;
}