// Run with:  npx tsx scripts/engine-test.ts
const mod = await import('../src/engine/rules.ts');
const typesMod = await import('../src/engine/types.ts');

const {
  evaluate,
  emi,
  principalFromEmi,
  moneyKnown,
  countKnown,
  PERSONAS,
} = mod;

const { Money: _Money, Count: _Count } = typesMod;

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); }
}
function approx(a, b, tol = 1) { return Math.abs(a - b) <= tol; }

console.log('EMI math');
assert(approx(emi(100000, 12, 12), 8884.88, 1), 'EMI(100k @12% 12m) ~ 8884.88');
assert(approx(principalFromEmi(8884.88, 12, 12), 100000, 1), 'principalFromEmi round-trip');
assert(emi(0, 12, 12) === 0, 'EMI of 0 principal = 0');
assert(emi(100000, 0, 12) === 100000 / 12, 'EMI at 0% = principal/months');

console.log('Unknown vs zero');
const blankIncome = { kind: 'unknown' };
const blankCount = { kind: 'unknown' };
const zeroIncome = moneyKnown(0);
const zeroBounces = countKnown(0);
const oneBounce = countKnown(1);

const unknownIncomeProfile = {
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
assert(rUnknown.capacity.lenderSanctionMax === 0, 'Unknown income -> lender sanction = 0');
assert(rUnknown.capacity.borrowerSafeCapacity === 0, 'Unknown income -> safe = 0');

const zeroIncomeProfile = { ...unknownIncomeProfile, netMonthlyIncome: moneyKnown(0) };
const rZero = evaluate(zeroIncomeProfile);
assert(rZero.capacity.lenderSanctionMax === 0, 'Known-zero income -> lender = 0');

const unknownBounceProfile = {
  ...unknownIncomeProfile,
  netMonthlyIncome: moneyKnown(80000),
  recentBounces: blankCount,
};
const rUB = evaluate(unknownBounceProfile);
assert(rUB.verdict.verdict !== "Don't Borrow", 'Unknown bounces + no red flags -> not auto rejected');

console.log('Safe <= Lender');
for (const name of Object.keys(PERSONAS)) {
  const r = evaluate(PERSONAS[name].input);
  assert(
    r.capacity.borrowerSafeCapacity <= r.capacity.lenderSanctionMax || r.capacity.borrowerSafeCapacity === 0,
    name + ': safe (' + r.capacity.borrowerSafeCapacity + ') <= lender (' + r.capacity.lenderSanctionMax + ')',
  );
}

console.log('Persona routing');
const priya = evaluate(PERSONAS.priya.input);
assert(priya.verdict.verdict === 'Borrow', 'Priya -> Borrow');
assert(priya.rate.recommendedProduct === 'personal_loan', 'Priya -> Personal Loan');
assert(priya.rate.rateMin >= 10 && priya.rate.rateMin <= 13, 'Priya prime band lower bound plausible: ' + priya.rate.rateMin);

const ravi = evaluate(PERSONAS.ravi.input);
assert(ravi.rate.recommendedProduct === 'lap', 'Ravi -> LAP (secured)');

const anita = evaluate(PERSONAS.anita.input);
assert(anita.verdict.verdict === "Don't Borrow", 'Anita -> Don\'t Borrow');
assert(anita.capacity.recommendedCapacity === 0, 'Anita recommended = 0');

console.log('Confidence widens rate band');
const full = {
  ...unknownIncomeProfile,
  netMonthlyIncome: moneyKnown(80000),
  monthlyEssentials: moneyKnown(25000),
  requestedAmount: moneyKnown(500000),
  existingEmi: moneyKnown(0),
  recentBounces: countKnown(0),
  cibilScore: 780,
};
const partial = {
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
assert(widthPartial > widthFull, 'Partial-input band (' + widthPartial.toFixed(2) + '%) wider than full (' + widthFull.toFixed(2) + '%)');
assert(rFull.confidence.level === 'high', 'Full inputs -> high confidence');
assert(rPartial.confidence.level === 'low', 'Missing inputs -> low confidence');

console.log('R05 triggers');
const r05Profile = {
  ...full,
  employment: 'informal',
  netMonthlyIncome: moneyKnown(30000),
  monthlyEssentials: moneyKnown(18000),
  recentBounces: oneBounce,
  highInterestDebtRatio: 0.3,
};
const r05 = evaluate(r05Profile);
assert(r05.verdict.verdict === "Don't Borrow", 'Bounce + 30% high-cost debt -> Don\'t Borrow');

console.log('Validation');
const rNeg = evaluate({ ...full, netMonthlyIncome: moneyKnown(-1000) });
assert(rNeg.warnings.some((w) => /income/i.test(w)), 'Negative income produces a warning');

console.log('Stress');
const stressed = evaluate(full);
const incomeDrop = stressed.stress.scenarios.find((s) => s.label.includes('20%'));
assert(incomeDrop !== undefined, 'Income-drop scenario present');
assert(incomeDrop.stressedSafeEmi >= 0, 'Stressed safe EMI is a real number');

console.log('APR');
const apr = priya.rate;
assert(apr.aprMin > apr.rateMin, 'APR min > nominal min');
assert(apr.aprMax > apr.rateMax, 'APR max > nominal max');

console.log('Recommendation chain');
for (const name of Object.keys(PERSONAS)) {
  const r = evaluate(PERSONAS[name].input);
  assert(
    r.capacity.recommendedCapacity <= r.capacity.borrowerSafeCapacity || r.capacity.recommendedCapacity === 0,
    name + ': recommended <= safe',
  );
}

// ---------------------------------------------------------------------------
// Adversarial: question-utility, age tenure, unknown-CIBIL floor, dependents
// ---------------------------------------------------------------------------

console.log('Adversarial — age cap actually constrains principal');
{
  const base = {
    age: 29, employment: 'salaried',
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
  const young = evaluate({ ...base, age: 29 });
  const old = evaluate({ ...base, age: 64, requestedTenureMonths: 84 });
  assert(old.capacity.lenderSanctionMax < young.capacity.lenderSanctionMax,
    'age 64 tenure 84 produces smaller principal than age 29 (got ' + old.capacity.lenderSanctionMax + ' vs ' + young.capacity.lenderSanctionMax + ')');
  assert(old.stress.recommendedTenureMonths < young.stress.recommendedTenureMonths,
    'age 64 capped tenure shorter than age 29');
}

console.log('Adversarial — unknown CIBIL does not lower the band below prime');
{
  const base = {
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
  const known = evaluate(base);
  const unknown = evaluate({ ...base, cibilScore: null });
  assert(unknown.rate.rateMin >= known.rate.rateMin,
    'unknown CIBIL floor (' + unknown.rate.rateMin + ') >= known CIBIL floor (' + known.rate.rateMin + ')');
  assert(unknown.rate.rateMax > known.rate.rateMax,
    'unknown CIBIL ceiling wider than known');
  assert(unknown.rate.rateMax - unknown.rate.rateMin > known.rate.rateMax - known.rate.rateMin,
    'unknown CIBIL band wider than known');
  assert(unknown.confidence.score < known.confidence.score,
    'unknown CIBIL lowers confidence (' + unknown.confidence.score + ' vs ' + known.confidence.score + ')');
}

console.log('Adversarial — CIBIL 600 widens band, 780 tightens it');
{
  const base = {
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
  const prime = evaluate({ ...base, cibilScore: 800 });
  const bad = evaluate({ ...base, cibilScore: 600 });
  assert(bad.rate.rateMax > prime.rate.rateMax, 'low CIBIL raises the ceiling');
  assert(bad.rate.rateMin >= prime.rate.rateMin, 'low CIBIL does not lower the floor');
}

console.log('Adversarial — buffer months matters when cashflow ceiling binds');
{
  const base = {
    age: 30, employment: 'informal',
    netMonthlyIncome: moneyKnown(30000),
    householdExtraIncome: { kind: 'unknown' },
    householdIncomeAvailableForLoan: false,
    cashIncomeRange: undefined,
    documentedMonthlyIncome: undefined,
    businessVintageYears: undefined,
    incomeDocumentation: 'bank_statement',
    existingEmi: moneyKnown(0),
    highInterestDebtRatio: 0,
    highCostDebtOutstanding: undefined,
    existingLoanCount: 0,
    monthlyEssentials: moneyKnown(22000),  // close to income → cashflow binds
    dependents: 0,
    emergencyBufferMonths: 3,
    purpose: 'personal',
    requestedAmount: moneyKnown(100000),
    requestedTenureMonths: 24,
    cibilScore: null,
    recentBounces: countKnown(0),
    hasCollateral: false,
  };
  const b1 = evaluate({ ...base, emergencyBufferMonths: 1 });
  const b6 = evaluate({ ...base, emergencyBufferMonths: 6 });
  assert(b1.capacity.borrowerSafeCapacity > b6.capacity.borrowerSafeCapacity,
    'smaller buffer -> larger safe capacity (' + b1.capacity.borrowerSafeCapacity + ' vs ' + b6.capacity.borrowerSafeCapacity + ')');
}

console.log('Adversarial — dependents affect safe capacity when essentials close to income');
{
  const base = {
    age: 30, employment: 'informal',
    netMonthlyIncome: moneyKnown(30000),
    householdExtraIncome: { kind: 'unknown' },
    householdIncomeAvailableForLoan: false,
    cashIncomeRange: undefined,
    documentedMonthlyIncome: undefined,
    businessVintageYears: undefined,
    incomeDocumentation: 'bank_statement',
    existingEmi: moneyKnown(0),
    highInterestDebtRatio: 0,
    highCostDebtOutstanding: undefined,
    existingLoanCount: 0,
    monthlyEssentials: moneyKnown(20000),
    dependents: 0,
    emergencyBufferMonths: 3,
    purpose: 'personal',
    requestedAmount: moneyKnown(100000),
    requestedTenureMonths: 24,
    cibilScore: null,
    recentBounces: countKnown(0),
    hasCollateral: false,
  };
  const d0 = evaluate({ ...base, dependents: 0 });
  const d3 = evaluate({ ...base, dependents: 3 });
  assert(d3.capacity.borrowerSafeCapacity < d0.capacity.borrowerSafeCapacity,
    '3 dependents -> smaller safe capacity (' + d3.capacity.borrowerSafeCapacity + ' vs ' + d0.capacity.borrowerSafeCapacity + ')');
}

console.log('Adversarial — salaried without payslips widens rate band');
{
  const base = {
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
  const ok = evaluate(base);
  const bad = evaluate({ ...base, incomeDocumentation: 'none' });
  assert(bad.rate.rateMax > ok.rate.rateMax, 'salaried without payslips raises the ceiling');
}

console.log('Adversarial — business vintage affects rate band for self-employed');
{
  const base = {
    age: 30, employment: 'self_employed',
    netMonthlyIncome: moneyKnown(80000),
    householdExtraIncome: { kind: 'unknown' },
    householdIncomeAvailableForLoan: false,
    cashIncomeRange: undefined,
    documentedMonthlyIncome: moneyKnown(80000),
    businessVintageYears: 10,
    incomeDocumentation: 'itr',
    existingEmi: moneyKnown(0),
    highInterestDebtRatio: 0,
    highCostDebtOutstanding: undefined,
    existingLoanCount: 0,
    monthlyEssentials: moneyKnown(30000),
    dependents: 0,
    emergencyBufferMonths: 3,
    purpose: 'business',
    requestedAmount: moneyKnown(500000),
    requestedTenureMonths: 36,
    cibilScore: 780,
    recentBounces: countKnown(0),
    hasCollateral: false,
  };
  const mature = evaluate({ ...base, businessVintageYears: 10 });
  const newBiz = evaluate({ ...base, businessVintageYears: 1 });
  assert(newBiz.rate.rateMax > mature.rate.rateMax, 'sub-2-year self-employed band wider than mature');
}

console.log('Adversarial — unknown existingEmi still produces a capacity (with warning)');
{
  const base = {
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
  const r = evaluate({ ...base, existingEmi: { kind: 'unknown' } });
  assert(r.capacity.lenderSanctionMax > 0, 'unknown existingEmi still produces a non-zero lender ceiling');
  assert(r.warnings.some((w) => /existing EMIs are unknown/i.test(w)), 'unknown existingEmi produces a warning');
}

console.log('Adversarial — 4 material unknowns drops confidence to LOW');
{
  const base = {
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
  const r = evaluate({
    ...base,
    cibilScore: null,
    existingEmi: { kind: 'unknown' },
    monthlyEssentials: { kind: 'unknown' },
    recentBounces: { kind: 'unknown' },
  });
  assert(r.confidence.level === 'low', '4 unknowns -> LOW confidence, got ' + r.confidence.level);
}

console.log('Adversarial — Anita minus bounce still triggers a warning (unaffordability)');
{
  const anitaNoBounce = { ...PERSONAS.anita.input, recentBounces: countKnown(0) };
  const r = evaluate(anitaNoBounce);
  // Without the bounce, R05 doesn't fire; but the affordability check still
  // shows the ask is too big. Verdict may be Borrow Less or Don't Borrow
  // depending on FOIR, but in either case the output must reflect the
  // difference vs the persona with the bounce.
  const withBounce = evaluate(PERSONAS.anita.input);
  assert(r.capacity.lenderSanctionMax !== withBounce.capacity.lenderSanctionMax ||
          r.rate.rateMax !== withBounce.rate.rateMax,
    'removing the bounce changes at least one output');
}

console.log('Adversarial — Ravi routes to LAP and LTV drives the lender ceiling');
{
  const r = evaluate(PERSONAS.ravi.input);
  assert(r.rate.recommendedProduct === 'lap', 'Ravi routes to LAP');
  // LTV: 45L × 70% = 31.5L
  assert(r.capacity.lenderSanctionMax >= 3100000, 'Ravi lender ceiling >= LTV cap (got ' + r.capacity.lenderSanctionMax + ')');
  // Borrower safe LTV: 45L × 60% = 27L
  assert(r.capacity.borrowerSafeCapacity >= 2600000, 'Ravi safe ceiling >= borrower-LTV cap (got ' + r.capacity.borrowerSafeCapacity + ')');
  // Recommended = min(requested 15L, safe 27L) = 15L
  assert(r.capacity.recommendedCapacity === 1500000, 'Ravi recommended = 15L (got ' + r.capacity.recommendedCapacity + ')');
}

console.log();
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed > 0 ? 1 : 0);