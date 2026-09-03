// Question-utility audit. For every question, prove it changes a meaningful
// output. Run with:  npx tsx scripts/question-utility.ts
import {
  evaluate,
  moneyKnown,
  countKnown,
  type BorrowerInput,
} from '../src/engine/rules.ts';

const OUTPUT_KEYS = [
  'verdict.verdict', 'verdict.reason', 'verdict.ruleId',
  'capacity.lenderSanctionMax', 'capacity.borrowerSafeCapacity', 'capacity.recommendedCapacity', 'capacity.foirAfterSafe',
  'rate.rateMin', 'rate.rateMax', 'rate.aprMin', 'rate.aprMax', 'rate.recommendedProduct',
  'stress.safeEmi', 'stress.proposedEmi', 'stress.recommendedTenureMonths',
  'confidence.level', 'confidence.score',
  'recommendedTenureMonths',
];

function snapshot(r: ReturnType<typeof evaluate>) {
  return {
    'verdict.verdict': r.verdict.verdict,
    'verdict.reason': r.verdict.reason,
    'verdict.ruleId': r.verdict.ruleId,
    'capacity.lenderSanctionMax': r.capacity.lenderSanctionMax,
    'capacity.borrowerSafeCapacity': r.capacity.borrowerSafeCapacity,
    'capacity.recommendedCapacity': r.capacity.recommendedCapacity,
    'capacity.foirAfterSafe': r.capacity.foirAfterSafe,
    'rate.rateMin': r.rate.rateMin,
    'rate.rateMax': r.rate.rateMax,
    'rate.aprMin': r.rate.aprMin,
    'rate.aprMax': r.rate.aprMax,
    'rate.recommendedProduct': r.rate.recommendedProduct,
    'stress.safeEmi': r.stress.safeEmi,
    'stress.proposedEmi': r.stress.proposedEmi,
    'stress.recommendedTenureMonths': r.stress.recommendedTenureMonths,
    'confidence.level': r.confidence.level,
    'confidence.score': r.confidence.score,
    'recommendedTenureMonths': r.recommendedTenureMonths,
  };
}

function full(): BorrowerInput {
  return {
    age: 30, employment: 'salaried',
    netMonthlyIncome: moneyKnown(100000),
    householdExtraIncome: { kind: 'unknown' },
    householdIncomeAvailableForLoan: false,
    cashIncomeRange: undefined,
    documentedMonthlyIncome: undefined,
    businessVintageYears: undefined,
    incomeDocumentation: 'payslips',
    existingEmi: moneyKnown(0),
    highInterestDebtRatio: 0,
    highCostDebtOutstanding: undefined,
    existingLoanCount: 0,
    monthlyEssentials: moneyKnown(30000),
    dependents: 0,
    emergencyBufferMonths: 3,
    purpose: 'personal',
    requestedAmount: moneyKnown(500000),
    requestedTenureMonths: 36,
    cibilScore: 780,
    recentBounces: countKnown(0),
    hasCollateral: false,
  };
}

const ref = snapshot(evaluate(full()));

const experiments: Array<[string, Partial<BorrowerInput>]> = [
  ['employment self_employed', { employment: 'self_employed' as const, businessVintageYears: 5, incomeDocumentation: 'itr' as const, documentedMonthlyIncome: moneyKnown(80000) }],
  ['employment informal', { employment: 'informal' as const, incomeDocumentation: 'bank_statement' as const }],
  ['income 200k', { netMonthlyIncome: moneyKnown(200000) }],
  ['income 50k', { netMonthlyIncome: moneyKnown(50000) }],
  ['cash range 40-80k', { cashIncomeRange: { min: 40000, max: 80000 } }],
  ['income doc none', { incomeDocumentation: 'none' as const }],
  ['business vintage 1', { businessVintageYears: 1 }],
  ['business vintage 10', { businessVintageYears: 10 }],
  ['household 20k', { householdExtraIncome: moneyKnown(20000), householdIncomeAvailableForLoan: true }],
  ['household 20k NOT for loan', { householdExtraIncome: moneyKnown(20000), householdIncomeAvailableForLoan: false }],
  ['essentials 60k', { monthlyEssentials: moneyKnown(60000) }],
  ['dependents 3', { dependents: 3 }],
  ['existing emi 20k', { existingEmi: moneyKnown(20000) }],
  ['high cost 30%', { highInterestDebtRatio: 0.3 }],
  ['high cost outstanding 50k', { highCostDebtOutstanding: moneyKnown(50000) }],
  ['bounces 1', { recentBounces: countKnown(1) }],
  ['cibil 600', { cibilScore: 600 }],
  ['cibil 820', { cibilScore: 820 }],
  ['cibil null', { cibilScore: null }],
  ['collateral 30L', { hasCollateral: true, collateralValue: moneyKnown(3000000), collateralLtv: 0.7 }],
  ['collateral 45L LTV .8', { hasCollateral: true, collateralValue: moneyKnown(4500000), collateralLtv: 0.8 }],
  ['purpose business', { purpose: 'business' as const, employment: 'self_employed' as const, businessVintageYears: 5, incomeDocumentation: 'itr' as const, documentedMonthlyIncome: moneyKnown(80000) }],
  ['purpose vehicle', { purpose: 'vehicle' as const }],
  ['purpose home_renovation', { purpose: 'home_renovation' as const, requestedAmount: moneyKnown(1500000) }],
  ['purpose debt_consolidation', { purpose: 'debt_consolidation' as const }],
  ['amount 1L', { requestedAmount: moneyKnown(100000) }],
  ['amount 5L', { requestedAmount: moneyKnown(500000) }],
  ['amount 50L', { requestedAmount: moneyKnown(5000000) }],
  ['tenure 12m', { requestedTenureMonths: 12 }],
  ['tenure 84m', { requestedTenureMonths: 84 }],
  ['age 22', { age: 22 }],
  ['age 55', { age: 55 }],
  ['age 65', { age: 65 }],
  ['buffer 6', { emergencyBufferMonths: 6 }],
  ['buffer 1', { emergencyBufferMonths: 1 }],
];

console.log('Each row shows which outputs change vs the reference.');
console.log('A field that never changes is decorative and should be removed.\n');

for (const [label, patch] of experiments) {
  const input = { ...full(), ...patch };
  const got = snapshot(evaluate(input));
  const changed: string[] = [];
  for (const k of Object.keys(ref) as Array<keyof typeof ref>) {
    if (ref[k] !== got[k]) changed.push(k);
  }
  if (changed.length === 0) {
    console.log('NO CHANGE  ', label);
  } else {
    console.log(changed.length.toString().padStart(2), 'change(s)', label, '->', changed.join(', '));
  }
}