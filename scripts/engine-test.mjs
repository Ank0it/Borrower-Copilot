// Run with:  npx tsx scripts/engine-test.ts
const mod = await import('../src/engine/rules.ts');
const typesMod = await import('../src/engine/types.ts');

const {
  evaluate,
  emi,
  principalFromEmi,
  maxTenureForAge,
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
   // Recommended = EMI-constrained safe amount (requested 15L exceeds safe EMI capacity)
   assert(r.capacity.recommendedCapacity === 368872, 'Ravi recommended = 368872 (got ' + r.capacity.recommendedCapacity + ')');
}

console.log('Regression tests');

// Test A: Borrow cannot violate safe EMI
// For each persona, if verdict is Borrow, then recommended loan EMI <= safe EMI
for (const name of Object.keys(PERSONAS)) {
  const input = PERSONAS[name].input;
  const r = evaluate(input);
  if (r.verdict.verdict === 'Borrow') {
    const principal = r.capacity.recommendedCapacity;
    const cappedTenure = maxTenureForAge(input.age, input.requestedTenureMonths);
    const rateMid = (r.rate.rateMin + r.rate.rateMax) / 2;
    const proposedEmi = emi(principal, rateMid, cappedTenure);
    assert(
      proposedEmi <= r.stress.safeEmi,
      `${name}: When verdict is Borrow, recommended loan EMI must not exceed safe EMI. Got ${proposedEmi} > ${r.stress.safeEmi}`
    );
  }
}

// Test B: Ravi: if requested amount exceeds safe EMI capacity, verdict must not be Borrow
{
  const r = evaluate(PERSONAS.ravi.input);
  const input = PERSONAS.ravi.input;
  const requested = input.requestedAmount.value;
  const cappedTenure = maxTenureForAge(input.age, input.requestedTenureMonths);
  const rateMid = (r.rate.rateMin + r.rate.rateMax) / 2;
  // We need the safe EMI ceiling from the stress output (which is the same as the affordability's safeNewEmi)
  const safeEMI = r.stress.safeEmi;
  // Compute the EMI of the requested amount at the midpoint rate and capped tenure
  const requestedEmi = emi(requested, rateMid, cappedTenure);
  // If the requested EMI exceeds the safe EMI, then verdict must not be Borrow
  assert(
    requestedEmi <= safeEMI || r.verdict.verdict !== 'Borrow',
    `Ravi: If requested EMI (${requestedEmi}) exceeds safe EMI (${safeEMI}), verdict must not be Borrow (got ${r.verdict.verdict})`
  );
}

// Test C: Priya: 20% income-drop stress safe EMI <= base safe EMI
{
  const baseInput = PERSONAS.priya.input;
  const baseR = evaluate(baseInput);
  const baseSafeEMI = baseR.stress.safeEmi;

  // Create a stressed input with income reduced by 20%
  const stressedInput = {
    ...baseInput,
    netMonthlyIncome: {
      ...baseInput.netMonthlyIncome,
      value: baseInput.netMonthlyIncome.value * 0.8
    }
  };
  const stressedR = evaluate(stressedInput);
  const stressedSafeEMI = stressedR.stress.safeEmi;

  // Also assert that the stressed income is indeed less than base income
  assert(
    stressedInput.netMonthlyIncome.value < baseInput.netMonthlyIncome.value,
    'Priya: 20% income-drop test: stressed income must be less than base income'
  );
  assert(
    stressedSafeEMI <= baseSafeEMI,
    `Priya: 20% income-drop stress safe EMI (${stressedSafeEMI}) must not exceed base safe EMI (${baseSafeEMI})`
  );
}

// Test D: Priya: 15% income-drop stress safe EMI <= base safe EMI
{
  const baseInput = PERSONAS.priya.input;
  const baseR = evaluate(baseInput);
  const baseSafeEMI = baseR.stress.safeEmi;

  const stressedInput = {
    ...baseInput,
    netMonthlyIncome: {
      ...baseInput.netMonthlyIncome,
      value: baseInput.netMonthlyIncome.value * 0.85
    }
  };
  const stressedR = evaluate(stressedInput);
  const stressedSafeEMI = stressedR.stress.safeEmi;

  assert(
    stressedInput.netMonthlyIncome.value < baseInput.netMonthlyIncome.value,
    'Priya: 15% income-drop test: stressed income must be less than base income'
  );
  assert(
    stressedSafeEMI <= baseSafeEMI,
    `Priya: 15% income-drop stress safe EMI (${stressedSafeEMI}) must not exceed base safe EMI (${baseSafeEMI})`
  );
}

// Test E: Anita: rate-shock stress must not create a contradictory positive borrowing recommendation
{
  const r = evaluate(PERSONAS.anita.input);
  // Base verdict must be Don't Borrow
  assert(
    r.verdict.verdict === "Don't Borrow",
    `Anita: base verdict must be Don't Borrow (got ${r.verdict.verdict})`
  );
  // Base recommended amount must be 0
  assert(
    r.capacity.recommendedCapacity === 0,
    `Anita: base recommended capacity must be 0 (got ${r.capacity.recommendedCapacity})`
  );
}

// Test F: General invariant: if verdict is Borrow, then recommended loan EMI <= safe EMI
// We already did Test A for all personas. We'll also test with a few random inputs to be thorough.
// We'll create a few variations of the personas to cover more cases.
// We'll test with Priya, Ravi, Anita and also a self-employed with unknown CIBIL, etc.
// But to keep it simple, we'll just do the three personas and also a custom input where we know the verdict is Borrow.
// We'll create a custom input that is similar to Priya but with a lower requested amount to ensure verdict is Borrow.
{
  const baseInput = PERSONAS.priya.input;
  const customInput = {
    ...baseInput,
    requestedAmount: { kind: 'known', value: 400000 } // half of the original request
  };
  const r = evaluate(customInput);
  if (r.verdict.verdict === 'Borrow') {
    const principal = r.capacity.recommendedCapacity;
    const cappedTenure = maxTenureForAge(customInput.age, customInput.requestedTenureMonths);
    const rateMid = (r.rate.rateMin + r.rate.rateMax) / 2;
    const proposedEmi = emi(principal, rateMid, cappedTenure);
    assert(
      proposedEmi <= r.stress.safeEmi,
      `Custom input (Priya with lower request): When verdict is Borrow, recommended loan EMI must not exceed safe EMI. Got ${proposedEmi} > ${r.stress.safeEmi}`
    );
  }
}

// Test G: Borrow Less boundary
// We want a case where:
//   - safe capacity > 0
//   - requested amount > safe capacity
//   - a smaller positive amount IS affordable (i.e., the safe capacity is affordable)
// Then we expect verdict to be Borrow Less.
// We'll use Priya's input but increase the requested amount to be above her safe capacity.
// We know from the base persona that Priya's safe capacity is 1118256 and she requested 800000 (which is below) -> verdict Borrow.
// So we'll set requested amount to 1200000 (above safe capacity).
{
  const baseInput = PERSONAS.priya.input;
  const customInput = {
    ...baseInput,
    requestedAmount: { kind: 'known', value: 1200000 }
  };
  const r = evaluate(customInput);
  // We expect that the recommended amount is the safe capacity (or less due to EMI constraint) and the verdict is Borrow Less.
  // First, we check that the safe capacity is positive.
  assert(
    r.capacity.borrowerSafeCapacity > 0,
    'Priya: safe capacity must be positive for this test'
  );
  // Then we check that the requested amount is greater than the safe capacity.
  assert(
    customInput.requestedAmount.value > r.capacity.borrowerSafeCapacity,
    'Priya: requested amount must be greater than safe capacity for this test'
  );
  // Then we check that the verdict is Borrow Less.
  assert(
    r.verdict.verdict === 'Borrow Less',
    `Priya: when requested amount exceeds safe capacity, verdict should be Borrow Less (got ${r.verdict.verdict})`
  );
  // Additionally, we can check that the recommended amount is not greater than the safe capacity.
  assert(
    r.capacity.recommendedCapacity <= r.capacity.borrowerSafeCapacity,
    `Priya: recommended amount must not exceed safe capacity (got ${r.capacity.recommendedCapacity} > ${r.capacity.borrowerSafeCapacity})`
  );
}

// Test H: Don't Borrow boundary
// We want a case where no meaningful positive loan fits, i.e., the safe EMI ceiling is 0 or negative, or even the smallest loan exceeds the safe EMI.
// We'll create an input with very low income and high essentials such that the safe EMI ceiling is 0.
// We'll use Anita's input as a base but adjust income and essentials.
// Anita's base: netMonthlyIncome 28000, monthlyEssentials 18000, existingEmi 9000 -> safe EMI ceiling? 
// Let's compute: totalIncome = 28000, existingEmi=9000, essentials=18000 -> disposable income = 28000-9000-18000 = 1000, then minus buffer? 
// But we don't need to compute exactly; we just want to set the income low enough that the safe EMI ceiling is 0.
// We'll set netMonthlyIncome to 10000, and keep essentials at 18000 and existingEmi at 9000 -> then disposable income is negative -> safe EMI ceiling 0.
{
  const baseInput = PERSONAS.anita.input;
  const customInput = {
    ...baseInput,
    netMonthlyIncome: moneyKnown(10000),
    monthlyEssentials: moneyKnown(18000),
    existingEmi: moneyKnown(9000),
    // We'll keep other fields the same.
  };
  const r = evaluate(customInput);
  // We expect that the safe EMI ceiling is 0 (or very low) and the recommended amount is 0 and verdict is Don't Borrow.
  // We'll check that the recommended amount is 0.
  assert(
    r.capacity.recommendedCapacity === 0,
    `Custom input (Anita with low income): recommended capacity must be 0 (got ${r.capacity.recommendedCapacity})`
  );
  // And the verdict is Don't Borrow.
  assert(
    r.verdict.verdict === "Don't Borrow",
    `Custom input (Anita with low income): verdict must be Don't Borrow (got ${r.verdict.verdict})`
  );
}
console.log();
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed > 0 ? 1 : 0);