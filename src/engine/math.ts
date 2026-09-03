// ============================================================================
// EMI / principal math (pure, deterministic)
// ============================================================================

/**
 * Standard flat-rate reducing-balance EMI:
 *   P * r * (1+r)^n / ((1+r)^n - 1)
 */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  const pow = Math.pow(1 + r, months);
  return (principal * r * pow) / (pow - 1);
}

/** Inverse EMI → principal. */
export function principalFromEmi(
  targetEmi: number,
  annualRatePct: number,
  months: number,
): number {
  if (targetEmi <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return targetEmi * months;
  const pow = Math.pow(1 + r, months);
  return (targetEmi * (pow - 1)) / (r * pow);
}

/** Maximum sensible tenure capped so the loan ends by age 60. */
export function maxTenureForAge(age: number, requestedMonths: number): number {
  const yearsLeft = Math.max(0, 60 - age);
  const monthsLeft = yearsLeft * 12;
  if (monthsLeft <= 0) return Math.min(requestedMonths, 12);
  return Math.min(requestedMonths, Math.max(12, monthsLeft));
}