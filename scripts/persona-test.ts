// Run with:  npx tsx scripts/persona-test.ts
// or:        node --experimental-strip-types scripts/persona-test.ts
import { evaluate } from '../src/engine/rules.ts';
import { PERSONAS } from '../src/engine/personas.ts';

for (const name of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) {
  const r = evaluate(PERSONAS[name].input);
  console.log('=== ' + name.toUpperCase() + ' ===');
  console.log('Verdict:', r.verdict.verdict, '|', r.verdict.ruleId);
  console.log('  reasons:', r.verdict.reasons);
  console.log('Lender Max:', r.capacity.lenderSanctionMax);
  console.log('Safe Capacity:', r.capacity.borrowerSafeCapacity);
  console.log('Recommended:', r.capacity.recommendedCapacity);
  console.log('Product:', r.rate.recommendedProduct);
  console.log('Rate band:', r.rate.rateMin + '% - ' + r.rate.rateMax + '%');
  console.log('APR:', r.rate.aprMin + '% - ' + r.rate.aprMax + '%');
  console.log('Processing fee:', (r.rate.processingFeePct * 100).toFixed(2) + '%');
  console.log('Confidence:', r.confidence.level, '(' + r.confidence.score + ')');
  console.log('Safe EMI:', r.stress.safeEmi);
  console.log('Proposed EMI:', r.stress.proposedEmi);
  console.log('Tenure (capped):', r.recommendedTenureMonths);
  for (const s of r.stress.scenarios) {
    console.log(`  Stress [${s.label}]: survives=${s.survives}, safe=${s.stressedSafeEmi}, emi=${s.stressedEmi}`);
  }
  console.log('Warnings:', r.warnings.length);
  console.log();
}