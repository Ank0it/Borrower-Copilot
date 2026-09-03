// ============================================================================
// Affordability output adapter (O2)
// ---------------------------------------------------------------------------
// Wraps the internal AffordabilityBreakdown into the public CapacityOutput
// shape, with borrower-specific rationales.
// ============================================================================
import type { BorrowerInput, CapacityOutput, EngineJustification } from './types';
import { assessAffordability } from './affordability';
import { inr, pct, round0 } from './money';

export function assessCapacity(input: BorrowerInput, verdictRecommendation: number): CapacityOutput {
  const a = assessAffordability(input);

  const rationaleLender: EngineJustification = a.lenderCapacityUnknown
    ? {
        text: `LENDER SANCTION: Cannot be calculated — ${a.lenderCapacityUnknown ? 'reliable income or existing EMI is unknown.' : ''}`,
        ruleId: 'R-AFFORD',
      }
    : {
        text: `Banks may approve up to ${pct(a.lenderFoirCap)} of your reliable monthly income (${inr(a.totalIncome)}) minus existing EMIs of ${inr(a.existingEmi)} — that leaves an EMI headroom of ${inr(a.totalIncome * a.lenderFoirCap - a.existingEmi)} at your requested tenure.`,
        ruleId: 'R-AFFORD',
      };

  const rationaleSafe: EngineJustification = a.safeCapacityUnknown
    ? {
        text: `SAFE CAPACITY: Cannot be calculated — reliable income or existing EMI is unknown.`,
        ruleId: 'R-AFFORD',
      }
    : {
        text: `After capping total debt outflow at the conservative ${pct(a.safeFoirCap)} of income AND reserving ${inr(a.monthlyEssentials)} for essentials plus ${inr(a.bufferContribution)}/mo for a 3-month emergency buffer, your disposable income only supports a new EMI of ${inr(a.safeNewEmi)}/mo — a lower principal.`,
        ruleId: 'R-AFFORD',
      };

  const rationaleRecommended: EngineJustification = {
    text:
      verdictRecommendation === 0
        ? `Recommendation: do not borrow. Stabilise existing obligations first.`
        : verdictRecommendation < a.lenderSanctionMax
          ? `Recommendation: borrow the safe-capacity number (${inr(verdictRecommendation)}), not the lender sanction (${inr(a.lenderSanctionMax)}). The safe number is guaranteed to keep your EMI below what your cash-flow actually supports.`
          : `Recommendation: borrow the safe-capacity number (${inr(verdictRecommendation)}). It is below the lender ceiling, leaving a buffer for income volatility.`,
    ruleId: 'R-AFFORD',
  };

  return {
    lenderSanctionMax: round0(a.lenderSanctionMax),
    borrowerSafeCapacity: round0(a.borrowerSafeCapacity),
    recommendedCapacity: round0(verdictRecommendation),
    foirAfterSafe: a.foirAfterSafe,
    lenderFoirCap: a.lenderFoirCap,
    safeFoirCap: a.safeFoirCap,
    rationaleLender,
    rationaleSafe,
    rationaleRecommended,
  };
}