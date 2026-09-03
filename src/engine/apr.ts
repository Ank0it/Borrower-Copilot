// ============================================================================
// APR / all-in-cost methodology
// ============================================================================
import { round2 } from './money';

/**
 * Estimated all-in APR (annualised).
 *
 * Methodology (my judgement, simplified RBI-style):
 *   APR = nominalRate + (processingFeePct * 100) / tenureYears
 *
 * The processing fee is paid upfront, so amortising it over the loan tenure is
 * a simplification — a strict IRR-based APR would compute a slightly higher
 * number. We label the output "Estimated APR" rather than "RBI-grade APR".
 *
 * Reference: RBI Master Direction on Fair Practices (2012, as amended) requires
 * lenders to disclose APR including all charges. Our method captures the
 * processing fee but ignores insurance, stamp duty, and documentation charges
 * which can add 0.5–1.5% on retail loans.
 */
export function estimateApr(
  nominalMin: number,
  nominalMax: number,
  processingFeePct: number,
  tenureMonths: number,
): { aprMin: number; aprMax: number; methodology: string } {
  const years = Math.max(1, tenureMonths / 12);
  const aprMin = nominalMin + (processingFeePct * 100) / years;
  const aprMax = nominalMax + (processingFeePct * 100) / years;
  return {
    aprMin: round2(aprMin),
    aprMax: round2(aprMax),
    methodology:
      'Estimated APR = nominal rate + (processing fee ÷ tenure in years). ' +
      'Simplified RBI-style; excludes insurance, stamp duty, documentation charges.',
  };
}