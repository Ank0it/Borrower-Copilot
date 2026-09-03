// ============================================================================
// Stress / EMI engine (O4)
// ----------------------------------------------------------------------------
// - safeEmi:    the per-month EMI the borrower can safely carry (from affordability.ts)
// - proposedEmi: the EMI on the recommended principal at the midpoint rate
// - tenureOptions: 24/36/48/60/84 month EMI table
// - scenarios: at least one calculated stress case (income drop or rate shock)
// ============================================================================
import type { BorrowerInput, EngineJustification, StressScenario } from './types';
import { emi, maxTenureForAge } from './math';
import { round0, inr } from './money';
import { assessAffordability } from './affordability';
import { assessRate } from './rates';

export interface StressBreakdown {
  safeEmi: number;
  proposedEmi: number;
  principal: number;
  rateMid: number;
  tenureOptions: { months: number; emi: number; totalInterest: number }[];
  scenarios: StressScenario[];
  rationaleSafeEmi: EngineJustification;
  recommendedTenureMonths: number;
}

export function assessStress(input: BorrowerInput): StressBreakdown {
  const aff = assessAffordability(input);
  const rate = assessRate(input);
  const rateMid = (rate.rateMin + rate.rateMax) / 2;

  const safeEmi = aff.safeNewEmi;
  const principal = aff.recommendedCapacity;

  const cappedTenure = maxTenureForAge(input.age, input.requestedTenureMonths);
  const proposedEmi = round0(emi(principal, rateMid, cappedTenure));

  const candidateMonths = [24, 36, 48, 60, 84];
  const tenureOptions = candidateMonths
    .map((m) => Math.min(m, cappedTenure))
    .filter((v, i, arr) => arr.indexOf(v) === i && v >= 6)
    .map((months) => {
      const e = emi(principal, rateMid, months);
      const totalInterest = e * months - principal;
      return {
        months,
        emi: round0(e),
        totalInterest: round0(Math.max(0, totalInterest)),
      };
    });

  const scenarios: StressScenario[] = [
    makeIncomeDropScenario(input, principal, rateMid, 0.2),
    makeIncomeDropScenario(input, principal, rateMid, 0.15),
    makeRateShockScenario(input, principal, rate, cappedTenure),
  ];

  const rationaleSafeEmi: EngineJustification = {
    text: `Safe EMI = MIN( conservative FOIR cap (${Math.round(aff.safeFoirCap * 100)}% of income), income – existing EMIs – essentials – buffer build-up ). At your income, the smaller of the two is ${inr(safeEmi)}/mo.`,
    ruleId: 'R-AFFORD',
  };

  return {
    safeEmi,
    proposedEmi,
    principal,
    rateMid,
    tenureOptions,
    scenarios,
    rationaleSafeEmi,
    recommendedTenureMonths: cappedTenure,
  };
}

function makeIncomeDropScenario(
  input: BorrowerInput,
  principal: number,
  rateMid: number,
  dropPct: number,
): StressScenario {
  const aff = assessAffordability(input);
  const totalIncome = aff.totalIncome;
  const existingEmi = aff.existingEmi;
  const essentials = aff.monthlyEssentials;

  const stressedIncome = totalIncome * (1 - dropPct);
  const stressedEmiRoom = Math.max(0, stressedIncome - existingEmi - essentials);
  const proposedEmiNow = emi(principal, rateMid, input.requestedTenureMonths);

  const survives = principal > 0 && proposedEmiNow <= stressedEmiRoom;

  return {
    label: `Income drops ${Math.round(dropPct * 100)}%`,
    stressedSafeEmi: round0(stressedEmiRoom),
    stressedEmi: round0(proposedEmiNow),
    survives,
    rationale: {
      text: `If your reliable monthly income falls ${Math.round(dropPct * 100)}% (R08), the safe EMI ceiling becomes ${inr(stressedEmiRoom)}/mo. Your proposed EMI is ${inr(round0(proposedEmiNow))}/mo. ${survives ? 'You survive this shock.' : 'You do not survive this shock — borrow less or extend tenure.'}`,
      ruleId: 'R08',
    },
  };
}

function makeRateShockScenario(
  input: BorrowerInput,
  principal: number,
  rate: ReturnType<typeof assessRate>,
  cappedTenure: number,
): StressScenario {
  const aff = assessAffordability(input);
  const shockedRate = rate.rateMin + 2;
  const shockedEmi = emi(principal, shockedRate, cappedTenure);
  const totalIncome = aff.totalIncome;
  const existingEmi = aff.existingEmi;

  const survives = principal > 0 && shockedEmi <= Math.max(0, totalIncome - existingEmi);

  return {
    label: 'Rate rises +200 bps',
    stressedSafeEmi: round0(Math.max(0, totalIncome - existingEmi)),
    stressedEmi: round0(shockedEmi),
    survives,
    rationale: {
      text: `If the rate rises 200 bps from the bottom of your band (${shockedRate.toFixed(2)}%), EMI becomes ${inr(round0(shockedEmi))}/mo. Today's EMI headroom after existing obligations is ${inr(round0(Math.max(0, totalIncome - existingEmi)))}/mo. ${survives ? 'You survive this shock.' : 'You do not survive this shock — borrow less or extend tenure.'}`,
      ruleId: 'R-RATE-SHOCK',
    },
  };
}