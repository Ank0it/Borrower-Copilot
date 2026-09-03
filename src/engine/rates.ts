// ============================================================================
// Rate engine
// ----------------------------------------------------------------------------
// Builds the headline rate band by combining:
//
//   productBaseline      — the floor/ceiling for the product alone
//   riskAdjustment       — driven by score + income volatility + bounces + high-cost debt
//   documentationAdjust  — penalises missing payslips/ITR (especially self-employed)
//   creditScoreUncertainty — widens band when CIBIL is unknown
//
// Then estimates an all-in APR by amortising the processing fee over tenure.
// ============================================================================
import type { BorrowerInput, LoanProduct, EngineJustification } from './types';
import { round2 } from './money';
import { productLabel, recommendProduct } from './products';

interface RateBand {
  min: number;
  max: number;
  processingFeePct: number;
}

/**
 * Product baseline band (in % p.a.) and processing fee.
 * My judgement — calibrated to current Indian retail market medians for
 * each product. Not sourced from a specific lender.
 */
function productBaseline(product: LoanProduct, employment: BorrowerInput['employment']): RateBand {
  switch (product) {
    case 'lap':
      if (employment === 'informal') return { min: 14, max: 18, processingFeePct: 0.015 };
      return { min: 10, max: 12.5, processingFeePct: 0.01 };
    case 'business_loan':
      if (employment === 'informal') return { min: 18, max: 28, processingFeePct: 0.025 };
      return { min: 14, max: 22, processingFeePct: 0.02 };
    case 'gold_loan':
      return { min: 9, max: 12, processingFeePct: 0.005 };
    case 'vehicle_loan':
      return { min: 9.5, max: 11.5, processingFeePct: 0.01 };
    case 'home_loan':
      return { min: 8.5, max: 10, processingFeePct: 0.005 };
    case 'consumer_durable':
      return { min: 16, max: 26, processingFeePct: 0.03 };
    case 'personal_loan':
    default:
      if (employment === 'informal') return { min: 18, max: 28, processingFeePct: 0.03 };
      if (employment === 'self_employed') return { min: 14, max: 22, processingFeePct: 0.025 };
      return { min: 10.99, max: 16, processingFeePct: 0.02 };
  }
}

/**
 * Risk adjustment — modifies the band by an additive delta at both ends.
 * For a prime borrower we may tighten the band; for risky profiles we widen it.
 * Returns { minAdd, maxAdd } in % points; maxAdd > minAdd widens, minAdd > maxAdd tightens.
 */
function riskAdjustment(input: BorrowerInput): { minAdd: number; maxAdd: number; reasons: string[] } {
  const reasons: string[] = [];
  let minAdd = 0;
  let maxAdd = 0;

  const score = input.cibilScore;

  // Credit score bands.
  if (score !== null) {
    if (score >= 780) {
      // Prime — tighten the upper end (lender competition).
      maxAdd -= 1.5;
      reasons.push('prime bureau score');
    } else if (score >= 740) {
      maxAdd -= 0.5;
      reasons.push('mid-prime bureau score');
    } else if (score >= 700) {
      minAdd += 1;
      maxAdd += 1;
      reasons.push('sub-prime bureau score');
    } else {
      minAdd += 3;
      maxAdd += 5;
      reasons.push('low bureau score');
    }
  } else {
    // Unknown CIBIL — small risk-side penalty; uncertainty widening handles
    // the main gap.
    minAdd += 0.5;
    maxAdd += 1;
    reasons.push('no bureau history on file');
  }

  // Bounces.
  if (input.recentBounces.kind === 'known' && input.recentBounces.value > 0) {
    minAdd += 1;
    maxAdd += 2;
    reasons.push(`${input.recentBounces.value} recent EMI bounce(s)`);
  }

  // High-cost debt load.
  if (input.highInterestDebtRatio > 0.25) {
    minAdd += 1;
    maxAdd += 2;
    reasons.push('high-cost existing debt');
  }

  return { minAdd, maxAdd, reasons };
}

/**
 * Documentation adjustment — penalises thin files.
 * Self-employed with no ITR pays a bigger surcharge than salaried with payslips.
 */
function documentationAdjustment(
  input: BorrowerInput,
): { minAdd: number; maxAdd: number; reasons: string[] } {
  const reasons: string[] = [];
  let minAdd = 0;
  let maxAdd = 0;

  const doc = input.incomeDocumentation;
  if (input.employment === 'informal' && doc === 'none') {
    minAdd += 3;
    maxAdd += 5;
    reasons.push('no income documentation');
  } else if (input.employment === 'informal' && doc === 'bank_statement') {
    minAdd += 1;
    maxAdd += 2;
    reasons.push('bank-statement-only income');
  } else if (input.employment === 'self_employed' && (doc === 'none' || doc === 'bank_statement')) {
    minAdd += 2;
    maxAdd += 3;
    reasons.push('no ITR / audited financials');
  } else if (input.employment === 'salaried' && (doc === 'none' || doc === 'bank_statement')) {
    // Salaried without payslips is treated by lenders as effectively informal
    // for pricing — they cannot confirm Form 16 / salary credits.
    minAdd += 2;
    maxAdd += 3;
    reasons.push('no payslips / Form 16');
  }

  // Business vintage (self-employed / informal). Sub-2-year business is a
  // start-up risk; sub-5-year still adds a small surcharge.
  if (
    (input.employment === 'self_employed' || input.employment === 'informal') &&
    typeof input.businessVintageYears === 'number'
  ) {
    if (input.businessVintageYears < 2) {
      minAdd += 1.5;
      maxAdd += 2;
      reasons.push('sub-2-year business vintage');
    } else if (input.businessVintageYears < 5) {
      minAdd += 0.5;
      maxAdd += 0.5;
      reasons.push('business vintage <5 years');
    }
  }

  // Income volatility — cash range ratio vs documented mid.
  if (input.cashIncomeRange) {
    const { min, max } = input.cashIncomeRange;
    if (max > 0) {
      const spread = (max - min) / max;
      if (spread >= 0.5) {
        minAdd += 1;
        maxAdd += 1;
        reasons.push('high income volatility');
      }
    }
  }

  return { minAdd, maxAdd, reasons };
}

/**
 * Credit-score uncertainty — only raises the upper end when CIBIL is unknown.
 * The floor is not lowered because we have no evidence the borrower is prime.
 * A 2% upward widening is my judgement — enough to reflect missing data
 * without producing a meaningless band.
 */
function creditScoreUncertainty(score: number | null): { widening: number } {
  if (score !== null) return { widening: 0 };
  return { widening: 2.0 };
}

export interface RateBreakdown {
  rateMin: number;
  rateMax: number;
  aprMin: number;
  aprMax: number;
  processingFeePct: number;
  recommendedProduct: LoanProduct;
  rationaleBand: EngineJustification;
  rationaleApr: EngineJustification;
  rationaleProduct: EngineJustification;
  components: {
    baseline: RateBand;
    risk: { minAdd: number; maxAdd: number; reasons: string[] };
    documentation: { minAdd: number; maxAdd: number; reasons: string[] };
    uncertainty: { widening: number };
  };
}

export function assessRate(input: BorrowerInput): RateBreakdown {
  const product = recommendProduct(input);
  const baseline = productBaseline(product, input.employment);

  const risk = riskAdjustment(input);
  const documentation = documentationAdjustment(input);
  const uncertainty = creditScoreUncertainty(input.cibilScore);

  let min = baseline.min + risk.minAdd + documentation.minAdd;
  let max = baseline.max + risk.maxAdd + documentation.maxAdd;
  // Asymmetric widening for missing bureau history: only push the ceiling up.
  min = Math.max(0, min);
  max = max + uncertainty.widening;

  const years = Math.max(1, input.requestedTenureMonths / 12);
  const aprMin = min + (baseline.processingFeePct * 100) / years;
  const aprMax = max + (baseline.processingFeePct * 100) / years;

  const reasonsForBand: string[] = [];
  if (risk.reasons.length > 0) reasonsForBand.push(...risk.reasons);
  if (documentation.reasons.length > 0) reasonsForBand.push(...documentation.reasons);
  if (uncertainty.widening > 0) reasonsForBand.push('CIBIL unknown — band widened ±2%');

  const rationaleBand: EngineJustification = {
    text:
      reasonsForBand.length === 0
        ? `For a ${productLabel(product)} on this profile, the market band is ${min.toFixed(2)}%–${max.toFixed(2)}% p.a.`
        : `For a ${productLabel(product)}, the band is ${min.toFixed(2)}%–${max.toFixed(2)}% p.a. Adjustments: ${reasonsForBand.join('; ')}.`,
    ruleId: 'R-RATE',
  };

  const rationaleApr: EngineJustification = {
    text: `Estimated all-in APR (RBI-style methodology, see methodology note): ${aprMin.toFixed(2)}%–${aprMax.toFixed(2)}%. This adds the ${(baseline.processingFeePct * 100).toFixed(2)}% processing fee amortised over ${years.toFixed(1)} years to the headline band. It is an estimate, not a regulator-grade APR disclosure.`,
    ruleId: 'R-APR',
  };

  const rationaleProduct: EngineJustification = {
    text:
      product === 'lap' || product === 'business_loan'
        ? `Because you have unencumbered collateral and the ask is large, this profile is routed to a ${productLabel(product)} — secured pricing is roughly half the unsecured price.`
        : `For your profile and stated purpose, a ${productLabel(product)} is the natural product.`,
    ruleId: product === 'lap' || product === 'business_loan' ? 'R04' : 'R-RATE',
  };

  return {
    rateMin: round2(min),
    rateMax: round2(max),
    aprMin: round2(aprMin),
    aprMax: round2(aprMax),
    processingFeePct: baseline.processingFeePct,
    recommendedProduct: product,
    rationaleBand,
    rationaleApr,
    rationaleProduct,
    components: { baseline, risk, documentation, uncertainty },
  };
}