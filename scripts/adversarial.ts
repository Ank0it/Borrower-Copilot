// Adversarial probes for the engine. Run with:  npx tsx scripts/adversarial.ts
import {
  evaluate,
  moneyKnown,
  countKnown,
  PERSONAS,
  type BorrowerInput,
} from '../src/engine/rules.ts';

interface Probe {
  label: string;
  r: ReturnType<typeof evaluate>;
}

const results: Probe[] = [];

function probe(label: string, input: BorrowerInput) {
  results.push({ label, r: evaluate(input) });
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

const ref = evaluate(full());

probe('full', full());
let p: BorrowerInput = full(); p.existingEmi = { kind: 'unknown' }; probe('unknown existingEmi', p);
p = full(); p.monthlyEssentials = { kind: 'unknown' }; probe('unknown essentials', p);
p = full(); p.cibilScore = null; probe('unknown CIBIL', p);
p = full(); p.recentBounces = { kind: 'unknown' }; probe('unknown bounces', p);
p = full(); p.netMonthlyIncome = { kind: 'unknown' }; probe('unknown income', p);
p = full(); p.netMonthlyIncome = { kind: 'unknown' }; p.monthlyEssentials = { kind: 'unknown' }; probe('unknown income+essentials', p);
p = full(); p.cibilScore = null; p.existingEmi = { kind: 'unknown' }; p.monthlyEssentials = { kind: 'unknown' }; p.recentBounces = { kind: 'unknown' }; probe('4 unknown material', p);
p = full(); p.cibilScore = 820; probe('CIBIL 820', p);
p = full(); p.cibilScore = 600; probe('CIBIL 600', p);
p = full(); p.recentBounces = countKnown(1); probe('one bounce', p);
p = full(); p.recentBounces = countKnown(1); p.highInterestDebtRatio = 0.1; probe('bounce + 10% high-cost', p);
p = full(); p.recentBounces = countKnown(1); p.highInterestDebtRatio = 0.3; probe('bounce + 30% high-cost', p);
p = full(); p.netMonthlyIncome = moneyKnown(20000); p.requestedAmount = moneyKnown(2000000); p.existingEmi = moneyKnown(15000); probe('very overstretched', p);
p = full(); p.netMonthlyIncome = moneyKnown(500000); p.monthlyEssentials = moneyKnown(10000); p.requestedAmount = moneyKnown(1000000); probe('high income, low expenses', p);
p = full(); p.requestedAmount = moneyKnown(2000000); probe('requested > safe', p);
p = full(); p.age = 59; p.requestedTenureMonths = 84; probe('age 59, 84m', p);
p = full(); p.age = 65; probe('age 65', p);
p = full(); p.age = 29; probe('age 29', p);
p = { ...PERSONAS.anita.input, recentBounces: countKnown(0) }; probe('Anita minus bounce', p);
p = { ...PERSONAS.anita.input, highInterestDebtRatio: 0 }; probe('Anita minus high-cost debt', p);
probe('Ravi (full)', PERSONAS.ravi.input);
p = full(); p.hasCollateral = true; p.collateralValue = moneyKnown(10000000); p.collateralLtv = 0.7; probe('full + huge collateral', p);

console.log();
console.log('label'.padEnd(38), '| verdict    | conf  | LendMax | Safe   | Rate band | S-20');
for (const { label, r } of results) {
  const s20 = r.stress.scenarios.find(s => s.label.includes('20%'));
  console.log(
    label.padEnd(38),
    '|', r.verdict.verdict.padEnd(10),
    '|', r.confidence.level.padEnd(5),
    '|', r.capacity.lenderSanctionMax.toString().padStart(7),
    '|', r.capacity.borrowerSafeCapacity.toString().padStart(6),
    '|', (r.rate.rateMin.toFixed(2) + '-' + r.rate.rateMax.toFixed(2)).padStart(10),
    '|', (s20 ? (s20.survives ? 'OK  ' : 'FAIL') : 'n/a '),
  );
}

console.log();
console.log('Reference (full inputs):  lender=' + ref.capacity.lenderSanctionMax + '  safe=' + ref.capacity.borrowerSafeCapacity);
console.log('UNKNOWN vs ZERO check:');
for (const { label, r } of results) {
  if (label.startsWith('unknown ') || label.startsWith('4 unknown')) {
    console.log('  ' + label.padEnd(30) + ' lender=' + r.capacity.lenderSanctionMax + '  safe=' + r.capacity.borrowerSafeCapacity);
  }
}

console.log();
console.log('SAFE <= LENDER check:');
let violations = 0;
for (const { label, r } of results) {
  if (r.capacity.borrowerSafeCapacity > r.capacity.lenderSanctionMax && r.capacity.borrowerSafeCapacity !== 0) {
    console.log('  VIOLATION: ' + label + ' safe=' + r.capacity.borrowerSafeCapacity + ' > lender=' + r.capacity.lenderSanctionMax);
    violations++;
  }
}
if (violations === 0) console.log('  (none)');

console.log();
console.log('CONFIDENCE drift:');
for (const { label, r } of results) {
  console.log(label.padEnd(38), '|', r.confidence.level, '(' + r.confidence.score + ')', '| missing=' + r.confidence.missingCritical.join(','));
}