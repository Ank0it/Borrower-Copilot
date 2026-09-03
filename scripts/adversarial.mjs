// Adversarial probes for the engine. Run with:  npx tsx scripts/adversarial.mjs
const mod = await import('../src/engine/rules.ts');
const { evaluate, moneyKnown, countKnown, PERSONAS } = mod;

const results = [];

function probe(label, input) {
  const r = evaluate(input);
  results.push({ label, r });
}

function full() {
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

// 1. Drop one material variable at a time.
probe('full', full());

let p = full(); p.existingEmi = { kind: 'unknown' }; probe('unknown existingEmi', p);

p = full(); p.monthlyEssentials = { kind: 'unknown' }; probe('unknown essentials', p);

p = full(); p.cibilScore = null; probe('unknown CIBIL', p);

p = full(); p.recentBounces = { kind: 'unknown' }; probe('unknown bounces', p);

p = full(); p.netMonthlyIncome = { kind: 'unknown' }; probe('unknown income', p);

// 2. Unknown expenses + unknown income.
p = full(); p.netMonthlyIncome = { kind: 'unknown' }; p.monthlyEssentials = { kind: 'unknown' }; probe('unknown income+essentials', p);

// 3. Remove material but keep many fields answered.
p = full(); p.cibilScore = null; p.existingEmi = { kind: 'unknown' }; p.monthlyEssentials = { kind: 'unknown' }; p.recentBounces = { kind: 'unknown' }; probe('many fields but 4 unknown material', p);

// 4. CIBIL test: prime tightens band vs no-CIBIL widens.
p = full(); p.cibilScore = 820; probe('CIBIL 820', p);
p = full(); p.cibilScore = 600; probe('CIBIL 600', p);

// 5. Bounce effect.
p = full(); p.recentBounces = countKnown(1); probe('one bounce', p);

// 6. Bounce + low-cost debt only.
p = full(); p.recentBounces = countKnown(1); p.highInterestDebtRatio = 0.1; probe('one bounce + 10% high-cost debt', p);

// 7. Bounce + 30% high-cost.
p = full(); p.recentBounces = countKnown(1); p.highInterestDebtRatio = 0.3; probe('one bounce + 30% high-cost debt', p);

// 8. Severe sustainability.
p = full(); p.netMonthlyIncome = moneyKnown(20000); p.requestedAmount = moneyKnown(2000000); p.existingEmi = moneyKnown(15000); probe('very overstretched', p);

// 9. Income very high, expenses very low (does safe stay bounded?).
p = full(); p.netMonthlyIncome = moneyKnown(500000); p.monthlyEssentials = moneyKnown(10000); p.requestedAmount = moneyKnown(1000000); probe('high income, low expenses', p);

// 10. Unsecured requested amount greater than safe.
p = full(); p.requestedAmount = moneyKnown(2000000); probe('requested > safe', p);

// 11. Age cap test.
p = full(); p.age = 59; p.requestedTenureMonths = 84; probe('age 59, requested 84m', p);
p = full(); p.age = 65; probe('age 65', p);
p = full(); p.age = 29; probe('age 29', p);

// 12. Anita minus bounces.
p = { ...PERSONAS.anita.input, recentBounces: countKnown(0) }; probe('Anita minus bounce', p);

// 13. Anita minus high-cost debt.
p = { ...PERSONAS.anita.input, highInterestDebtRatio: 0 }; probe('Anita minus high-cost debt', p);

// 14. Ravi's reported cash range vs documented ITR only.
p = { ...PERSONAS.ravi.input }; probe('Ravi (full)', p);

// 15. Safe must be ≤ lender — construct one that tries to break it.
p = full(); p.hasCollateral = true; p.collateralValue = moneyKnown(10000000); p.collateralLtv = 0.7;
probe('full + huge collateral', p);

// Print the table.
console.log();
console.log('label | verdict | conf | LendMax | Safe | Rate band | Stress-20');
for (const { label, r } of results) {
  const income20 = r.stress.scenarios.find(s => s.label.includes('20%'));
  console.log(
    label.padEnd(40),
    '|', r.verdict.verdict.padEnd(13),
    '|', r.confidence.level.padEnd(6),
    '|', r.capacity.lenderSanctionMax.toString().padStart(9),
    '|', r.capacity.borrowerSafeCapacity.toString().padStart(9),
    '|', (r.rate.rateMin.toFixed(2) + '-' + r.rate.rateMax.toFixed(2)).padStart(10),
    '|', (income20 ? (income20.survives ? 'OK ' : 'FAIL') : 'n/a ').padStart(4),
  );
}
console.log();
console.log('UNKNOWN vs ZERO behaviour check');
console.log('Reference (full inputs):  lender=' + ref.capacity.lenderSanctionMax + '  safe=' + ref.capacity.borrowerSafeCapacity);
for (const { label, r } of results) {
  if (label.startsWith('unknown ')) {
    console.log(label + ': lender=' + r.capacity.lenderSanctionMax + '  safe=' + r.capacity.borrowerSafeCapacity);
  }
}
console.log();
console.log('SAFE <= LENDER check');
for (const { label, r } of results) {
  if (r.capacity.borrowerSafeCapacity > r.capacity.lenderSanctionMax && r.capacity.borrowerSafeCapacity !== 0) {
    console.log('  VIOLATION: ' + label + ' safe=' + r.capacity.borrowerSafeCapacity + ' > lender=' + r.capacity.lenderSanctionMax);
  }
}
console.log();
console.log('CONFIDENCE drift');
for (const { label, r } of results) {
  console.log(label.padEnd(40), '|', r.confidence.level, '(' + r.confidence.score + ')', '| missing=' + r.confidence.missingCritical.join(','));
}