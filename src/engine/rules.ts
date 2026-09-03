// ============================================================================
// Top-level engine entrypoint
// ============================================================================
import type { BorrowerInput, EngineResult } from './types';
import { assessVerdict } from './verdict';
import { assessCapacity } from './capacity';
import { assessRate } from './rates';
import { assessStress } from './stress';
import { assessConfidence } from './confidence';
import { validate } from './money';
import { assessAffordability } from './affordability';

export * from './types';
export * from './money';
export * from './math';
export * from './products';
export * from './rates';
export * from './affordability';
export * from './capacity';
export * from './verdict';
export * from './stress';
export * from './confidence';
export * from './apr';
export * from './personas';

export function evaluate(input: BorrowerInput): EngineResult {
  const verdict = assessVerdict(input);
  const rawSafe = assessAffordability(input).borrowerSafeCapacity;
  const requested = input.requestedAmount.kind === 'known' ? input.requestedAmount.value : 0;
  const recommendation =
    verdict.verdict === "Don't Borrow" ? 0 : Math.min(requested, rawSafe);
  const capacity = assessCapacity(input, recommendation);
  const rate = assessRate(input);
  const stress = assessStress(input);
  const confidence = assessConfidence(input);

  const warnings: string[] = [];
  for (const i of validate(input)) warnings.push(`${i.field}: ${i.message}`);
  if (input.cibilScore === null) {
    warnings.push(
      'Credit score unknown — rate band widened ±2% and confidence capped at MEDIUM.',
    );
  }
  if (input.netMonthlyIncome.kind === 'unknown' && !input.cashIncomeRange) {
    warnings.push(
      'Income is unknown and no cash range was given — we cannot compute a meaningful capacity.',
    );
  }
  if (input.recentBounces.kind === 'known' && input.recentBounces.value > 0) {
    warnings.push(
      'Recent EMI bounce detected. Most lenders will price you in the worst tier regardless of headline rate.',
    );
  }
  if (input.existingEmi.kind === 'unknown') {
    warnings.push(
      'Existing EMIs are unknown — capacity is calculated without subtracting them, which overstates the safe figure.',
    );
  }
  if (input.monthlyEssentials.kind === 'unknown') {
    warnings.push(
      'Monthly essentials are unknown — safe capacity uses the FOIR cap only, not disposable-income. This is conservative.',
    );
  }

  return {
    verdict,
    capacity,
    rate,
    stress,
    confidence,
    warnings,
    recommendedTenureMonths: stress.recommendedTenureMonths,
  };
}