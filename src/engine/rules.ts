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

import { emi, principalFromEmi, maxTenureForAge } from './math';
export function evaluate(input: BorrowerInput): EngineResult {
  const verdict = assessVerdict(input);
  const aff = assessAffordability(input);
  const rate = assessRate(input);
  const rawSafe = aff.borrowerSafeCapacity;
  const requested = input.requestedAmount.kind === 'known' ? input.requestedAmount.value : 0;
  let recommendation = 0;
  if (verdict.verdict !== "Don't Borrow") {
    recommendation = Math.min(requested, rawSafe);
    // Apply EMI safety constraint: ensure the recommended loan's EMI at midpoint rate does not exceed safe EMI ceiling
    if (recommendation > 0) {
      const cappedTenure = maxTenureForAge(input.age, input.requestedTenureMonths);
      const rateMid = (rate.rateMin + rate.rateMax) / 2;
      const proposedEmi = emi(recommendation, rateMid, cappedTenure);
      if (proposedEmi > aff.safeNewEmi) {
        // Reduce recommendation to the max principal that yields EMI <= safeNewEmi
        const maxSafePrincipal = principalFromEmi(aff.safeNewEmi, rateMid, cappedTenure);
        if (maxSafePrincipal < recommendation) {
          recommendation = maxSafePrincipal;
        }
      }
      // If after constraint the recommended is zero, treat as unaffordable
      if (recommendation <= 0) {
        verdict.verdict = "Don't Borrow";
        verdict.ruleId = 'R-AFFORD';
        // Prepend our reason so it becomes the first reason
        verdict.reasons = [
          `Even a minimal loan would exceed your safe EMI ceiling given current income and obligations.`,
          ...verdict.reasons
        ];
        recommendation = 0;
      }
    }
  }
  // Update the reason string (summary) based on the final verdict and reasons
  if (verdict.verdict === "Don't Borrow") {
    verdict.reason = verdict.reasons[0];
  } else if (verdict.verdict === 'Borrow Less') {
    verdict.reason = `Conditional yes — but borrow less: ${verdict.reasons[0]}`;
  } else {
    verdict.reason = `Yes, with the following check: ${verdict.reasons[0]}`;
  }

  const capacity = assessCapacity(input, recommendation);
  const stress = assessStress(input, recommendation);
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