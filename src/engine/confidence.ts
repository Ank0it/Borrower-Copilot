// ============================================================================
// Confidence model
// ----------------------------------------------------------------------------
// Score (0..1) depends on whether material evidence is known.
// Thresholds:
//   HIGH    : score ≥ 0.8
//   MEDIUM  : score ≥ 0.5
//   LOW     : < 0.5
//
// Each material variable contributes a fraction. Unknown values are penalised.
// ============================================================================
import type { BorrowerInput, Confidence, ConfidenceOutput } from './types';
import { isUnknown, isUnknownCount } from './money';

const WEIGHTS = {
  netIncome: 0.18,
  cashRange: 0.07,
  existingEmi: 0.16,
  monthlyEssentials: 0.14,
  requestedAmount: 0.10,
  recentBounces: 0.08,
  cibilScore: 0.10,
  age: 0.04,
  purpose: 0.03,
  employment: 0.05,
  tenure: 0.05,
} as const;

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

export function assessConfidence(input: BorrowerInput): ConfidenceOutput {
  const missing: string[] = [];

  const checks: Array<[keyof typeof WEIGHTS, boolean, string]> = [
    ['netIncome', input.netMonthlyIncome.kind === 'known', 'monthly income'],
    ['cashRange', input.cashIncomeRange != null, 'declared cash range'],
    ['existingEmi', !isUnknown(input.existingEmi), 'existing EMIs'],
    ['monthlyEssentials', !isUnknown(input.monthlyEssentials), 'monthly essentials'],
    ['requestedAmount', input.requestedAmount.kind === 'known', 'requested amount'],
    ['recentBounces', !isUnknownCount(input.recentBounces), 'recent bounces'],
    ['cibilScore', input.cibilScore !== null, 'credit score'],
    ['age', input.age >= 18 && input.age <= 90, 'age'],
    ['purpose', !!input.purpose, 'loan purpose'],
    ['employment', !!input.employment, 'employment type'],
    ['tenure', input.requestedTenureMonths > 0, 'tenure'],
  ];

  let earned = 0;
  for (const [k, ok, label] of checks) {
    if (ok) earned += WEIGHTS[k];
    else missing.push(label);
  }

  const raw = earned / TOTAL_WEIGHT;
  let level: Confidence;
  if (raw >= 0.8) level = 'high';
  else if (raw >= 0.5) level = 'medium';
  else level = 'low';

  return {
    level,
    score: Math.round(raw * 100) / 100,
    missingCritical: missing,
    rationale: {
      text:
        missing.length === 0
          ? `All material inputs were provided. Confidence: ${level.toUpperCase()}.`
          : `Confidence is ${level.toUpperCase()} because ${missing.length} material input(s) are missing: ${missing.join(', ')}. Missing data widens rate bands and reduces how much we can promise about capacity.`,
      ruleId: 'R-CONF',
    },
  };
}

/** Convenience flag for downstream consumers. */
export function flagMissing(input: BorrowerInput): string[] {
  return assessConfidence(input).missingCritical;
}