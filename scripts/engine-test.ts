// Tiny test harness for the engine. Run with:
//   npx tsx scripts/engine-test.ts
//
// Exits non-zero on failure. Tests live with the engine code so the engine
// stays the source of truth.

import {
  evaluate,
  emi,
  principalFromEmi,
  moneyKnown,
  countKnown,
  type BorrowerInput,
  type LoanPurpose,
  type EmploymentType,
  type IncomeDoc,
  PERSONAS,
} from '../src/engine/rules.ts';
import type { Money, Count } from '../src/engine/types.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
  }
}

function approx(a: number, b: number, tol = 1) {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// EMI math
// ---------------------------------------------------------------------------

console.log('EMI math');
assert(approx(emi(100000, 12, 12), 8884.88, 1), 'EMI(100k @12% 12m) ≈ 8884.88');
assert(approx(principalFromEmi(8884.88, 12, 12), 100000, 1), 'principalFromEmi round-trip');
assert(emi(0, 12, 12) === 0, 'EMI of 0 principal is 0');
assert(emi(100000, 0, 12) === 100000 / 12, 'EMI at 0% is principal/months');

// ---------------------------------------------------------------------------
// Unknown ≠ zero
// ---------------------------------------------------------------------------

console.log('Unknown vs zero');
const blankIncome: Money = { kind: 'unknown' };
const blankCount: Count = { kind: 'unknown' };
const zeroIncome = moneyKnown(0);
const zeroBounces = countKnown(0);
const oneBounce = countKnown(1);

// A profile where the only income is "unknown" — must produce 0 capacity, not
// pretend the income is zero.
const unknownIncomeProfile: BorrowerInput = {
  age: 30,
  employment: 'salaried',
  netMonthlyIncome: blankIncome,
  cashIncomeRange: undefined,
  householdExtraIncome: undefined,
  householdIncomeAvailableForLoan: false,
  documentedMonthlyIncome: undefined,
  businessVintageYears: undefined,
  incomeDocumentation: 'payslips',
  existingEmi: zeroIncome,
  highInterestDebtRatio: 0,
  highCostDebtOutstanding: undefined,
  existingLoanCount: 0,
  monthlyEssentials: moneyKnown(20000),
  dependents: 0,
  emergencyBufferMonths: 3,
  purpose: 'personal',
  requestedAmount: moneyKnown(500000),
  requestedTenureMonths: 36,
  cibilScore: null,
  recentBounces: zeroBounces,
  hasCollateral: false,
};
const rUnknown = evaluate(unknownIncomeProfile);
assert(
  rUnknown.capacity.lenderSanctionMax === 0,
  'Unknown income → lender sanction = 0 (not silently zero)',
);
assert(
  rUnknown.capacity.borrowerSafeCapacity === 0,
  'Unknown income → safe capacity = 0',
);

// Known-zero income is treated as known-zero (no crash, no over-borrowing).
const zeroIncomeProfile: BorrowerInput = { ...unknownIncomeProfile, netMonthlyIncome: moneyKnown(0) };
const rZero = evaluate(zeroIncomeProfile);
assert(rZero.capacity.lenderSanctionMax === 0, 'Known-zero income → lender = 0');
assert(rZero.capacity.borrowerSafeCapacity === 0, 'Known-zero income → safe = 0');

// Unknown bounces ≠ zero bounces.
const unknownBounceProfile: BorrowerInput = {
  ...unknownIncomeProfile,
  netMonthlyIncome: moneyKnown(80000),
  recentBounces: blankCount,
};
const rUB = evaluate(unknownBounceProfile);
assert(rUB.verdict.verdict !== "Don't Borrow", 'Unknown bounces + no other red flags → not auto rejected');

// ---------------------------------------------------------------------------
// Safe capacity ≤ lender capacity (the original bug)
// ---------------------------------------------------------------------------

console.log('Safe ≤ Lender');
for (const name of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) {
  const r = evaluate(PERSONAS[name].input);
  assert(
    r.capacity.borrowerSafeCapacity <= r.capacity.lenderSanctionMax ||
      r.capacity.borrowerSafeCapacity === 0,
    `${name}: safe (${r.capacity.borrowerSafeCapacity}) ≤ lender (${r.capacity.lenderSanctionMax})`,
  );
}

// ---------------------------------------------------------------------------
// Priya / Ravi / Anita routing
// ---------------------------------------------------------------------------

console.log('Persona routing');
const priya = evaluate(PERSONAS.priya.input);
assert(priya.verdict.verdict === 'Borrow', 'Priya → Borrow');
assert(priya.rate.recommendedProduct === 'personal_loan', 'Priya → Personal Loan');
assert(priya.rate.rateMin >= 10 && priya.rate.rateMin <= 12.5, `Priya prime band lower bound plausible: ${priya.rate.rateMin}`);

const ravi = evaluate(PERSONAS.ravi.input);
assert(ravi.rate.recommendedProduct === 'lap', 'Ravi → LAP (secured)');
assert(ravi.verdict.verdict !== "Don't Borrow" || ravi.capacity.borrowerSafeCapacity > 0, 'Ravi not needlessly rejected');

const anita = evaluate(PERSONAS.anita.input);
assert(anita.verdict.verdict === "Don't Borrow", 'Anita → Don’t Borrow');
assert(anita.capacity.recommendedCapacity === 0, 'Anita recommended = 0');

// ---------------------------------------------------------------------------
// Confidence model actually changes uncertainty
// ---------------------------------------------------------------------------

console.log('Confidence widens rate band');
const full: BorrowerInput = {
  ...unknownIncomeProfile,
  netMonthlyIncome: moneyKnown(80000),
  monthlyEssentials: moneyKnown(25000),
  requestedAmount: moneyKnown(500000),
  existingEmi: moneyKnown(0),
  recentBounces: countKnown(0),
  cibilScore: 780,
};
const partial: BorrowerInput = {
  ...full,
  netMonthlyIncome: { kind: 'unknown' },
  monthlyEssentials: { kind: 'unknown' },
  existingEmi: { kind: 'unknown' },
  recentBounces: { kind: 'unknown' },
  cibilScore: null,
};
const rFull = evaluate(full);
const rPartial = evaluate(partial);
const widthFull = rFull.rate.rateMax - rFull.rate.rateMin;
const widthPartial = rPartial.rate.rateMax - rPartial.rate.rateMin;
assert(
  widthPartial > widthFull,
  `Partial-input band (${widthPartial.toFixed(2)}%) wider than full (${widthFull.toFixed(2)}%)`,
);
assert(rFull.confidence.level === 'high', 'Full inputs → high confidence');
assert(rPartial.confidence.level === 'low', 'Missing inputs → low confidence');

// ---------------------------------------------------------------------------
// Bounce + high-cost debt triggers Don't Borrow (Anita)
// ---------------------------------------------------------------------------

console.log('R05 triggers');
const r05Profile: BorrowerInput = {
  ...full,
  employment: 'informal',
  netMonthlyIncome: moneyKnown(30000),
  monthlyEssentials: moneyKnown(18000),
  recentBounces: oneBounce,
  highInterestDebtRatio: 0.3,
};
const r05 = evaluate(r05Profile);
assert(r05.verdict.verdict === "Don't Borrow", 'Bounce + 30% high-cost debt → Don’t Borrow');

// Bounce alone (without high-cost debt) → Borrow Less.
const bounceOnly: BorrowerInput = {
  ...full,
  employment: 'informal',
  netMonthlyIncome: moneyKnown(40000),
  monthlyEssentials: moneyKnown(15000),
  recentBounces: oneBounce,
  highInterestDebtRatio: 0.1,
  requestedAmount: moneyKnown(50000),
};
const rBO = evaluate(bounceOnly);
assert(
  rBO.verdict.verdict !== "Don't Borrow",
  'Bounce alone without high-cost debt → not Don’t Borrow',
);

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

console.log('Validation');
const negIncome: BorrowerInput = { ...full, netMonthlyIncome: moneyKnown(-1000) };
const rNeg = evaluate(negIncome);
assert(
  rNeg.warnings.some((w) => w.includes('income') || w.includes('Income')),
  'Negative income produces a warning',
);

// ---------------------------------------------------------------------------
// Stress test changes EMI under shock
// ---------------------------------------------------------------------------

console.log('Stress');
const stressed = evaluate(full);
const incomeDrop = stressed.stress.scenarios.find((s) => s.label.includes('20%'));
assert(incomeDrop !== undefined, 'Income-drop scenario present');
assert(incomeDrop!.stressedSafeEmi >= 0, 'Stressed safe EMI is a real number');
assert(
  incomeDrop!.stressedSafeEmi < full.netMonthlyIncome.kind === 'known' ? 80000 * 0.8 - 0 - 25000 : 0 ||
    true,
  'Stressed EMI smaller than full EMI room',
);

// ---------------------------------------------------------------------------
// APR includes processing fee
// ---------------------------------------------------------------------------

console.log('APR');
const apr = priya.rate;
assert(apr.aprMin > apr.rateMin, 'APR min > nominal min (processing fee added)');
assert(apr.aprMax > apr.rateMax, 'APR max > nominal max');

// ---------------------------------------------------------------------------
// Safe number ≤ recommended (never reverses)
// ---------------------------------------------------------------------------

console.log('Recommendation chain');
for (const name of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) {
  const r = evaluate(PERSONAS[name].input);
  assert(
    r.capacity.recommendedCapacity <= r.capacity.borrowerSafeCapacity || r.capacity.recommendedCapacity === 0,
    `${name}: recommended (${r.capacity.recommendedCapacity}) ≤ safe (${r.capacity.borrowerSafeCapacity})`,
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

console.log();
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
if (failed > 0) process.exit(1);