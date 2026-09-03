// ============================================================================
// Affordability engine — separates LENDER capacity from SAFE borrower capacity.
// ----------------------------------------------------------------------------
// LENDER CAPACITY (banks' view)
//   product / lender-style affordability assessment
//   cap = lenderFoirCap[employment]
//   emiRoom = totalReliableIncome * cap - existingEmi
//
// BORROWER SAFE CAPACITY (the borrower's view, conservative)
//   safeEmi = MIN(
//     lenderFoirCap * totalReliableIncome - existingEmi,
//     totalReliableIncome - existingEmi - essentials - buffer build-up
//   )
//   Both ceilings apply — the safe number is the smaller of the two.
//
// The safe number is GUARANTEED to be ≤ lender capacity.
// ============================================================================
import type { BorrowerInput } from './types';
import { moneyValue, isUnknown, round0 } from './money';
import { principalFromEmi, maxTenureForAge } from './math';
import { recommendProduct } from './products';
import { flagMissing } from './confidence';

/**
 * FOIR cap used by lender for the *maximum* they will approve.
 * My judgement — Indian retail banks typically use 50% for salaried,
 * tighter for self-employed, much tighter for informal.
 */
export function lenderFoirCap(emp: BorrowerInput['employment']): number {
  switch (emp) {
    case 'salaried':
      return 0.5;
    case 'self_employed':
      return 0.4;
    case 'informal':
      return 0.3;
  }
}

/**
 * Conservative cap the *borrower* should hold themselves to. Always ≤ lender cap.
 * The 5-point buffer reflects that lender cap is the upper end of what banks
 * accept, not what is comfortable for the borrower.
 */
export function safeFoirCap(emp: BorrowerInput['employment']): number {
  switch (emp) {
    case 'salaried':
      return 0.4; // 40% — leaves 10 pts under the 50% lender cap
    case 'self_employed':
      return 0.3; // 30% — leaves 10 pts under the 40% lender cap
    case 'informal':
      return 0.2; // 20% — leaves 10 pts under the 30% lender cap
  }
}

/**
 * The income figure actually used in FOIR calculations.
 * Rules:
 *  - Salaried: net payslip income.
 *  - Self-employed: documented monthly income (ITR / audited). Cash range only
 *    widens uncertainty, never inflates capacity.
 *  - Informal: net income declared by borrower; if unknown, fall back to the
 *    midpoint of the cash range.
 *  - Spouse income only counts if explicitly marked "available for loan".
 *
 * `declared` is the user-facing income (e.g. on the Negotiation Card); for
 * self-employed this is the cash midpoint, NOT the ITR cap.
 */
export function effectiveMonthlyIncome(input: BorrowerInput): {
  income: number;
  declared: number | null;
  sources: string[];
} {
  const sources: string[] = [];
  let declared: number | null = null;
  let income = 0;

  if (input.netMonthlyIncome.kind === 'known') {
    income += input.netMonthlyIncome.value;
    declared = input.netMonthlyIncome.value;
    sources.push('primary net income');
  } else if (input.cashIncomeRange) {
    const mid = (input.cashIncomeRange.min + input.cashIncomeRange.max) / 2;
    income += mid;
    declared = mid;
    sources.push(`midpoint of declared cash range ₹${input.cashIncomeRange.min.toLocaleString('en-IN')}–₹${input.cashIncomeRange.max.toLocaleString('en-IN')}`);
  } else if (input.documentedMonthlyIncome && input.documentedMonthlyIncome.kind === 'known') {
    income += input.documentedMonthlyIncome.value;
    declared = input.documentedMonthlyIncome.value;
    sources.push('documented monthly income');
  }

  // Self-employed: ITR income is what the lender will recognise. We cap the
  // FOIR base at ITR even if declared cash income is higher.
  if (
    input.employment === 'self_employed' &&
    input.documentedMonthlyIncome &&
    input.documentedMonthlyIncome.kind === 'known'
  ) {
    income = Math.min(income, input.documentedMonthlyIncome.value);
    if (!sources.includes('capped to documented (ITR) income')) {
      sources.push('capped to documented (ITR) income');
    }
  }

  if (
    input.householdExtraIncome &&
    input.householdExtraIncome.kind === 'known' &&
    input.householdIncomeAvailableForLoan === true
  ) {
    income += input.householdExtraIncome.value;
    sources.push('spouse income (available for loan)');
  }

  return { income, declared, sources };
}

/**
 * LENDER capacity: how much principal fits inside the lender FOIR cap,
 * after subtracting existing EMIs, at the assumed rate.
 *
 * For secured products we ALSO consider the LTV cap on the collateral and
 * take the higher of the two — a bank will lend up to whichever is smaller
 * from the borrower's perspective, but a LAP can be sized larger than the
 * FOIR-derived figure when strong collateral is offered.
 *
 * If income / existing EMIs are unknown, we cannot honestly produce a number —
 * we return 0 with `lenderCapacityUnknown = true`.
 */
export interface AffordabilityBreakdown {
  lenderSanctionMax: number;
  borrowerSafeCapacity: number;
  recommendedCapacity: number;
  lenderCapacityUnknown: boolean;
  safeCapacityUnknown: boolean;
  lenderFoirCap: number;
  safeFoirCap: number;
  foirAfterSafe: number;
  totalIncome: number;
  totalIncomeKnown: boolean;
  existingEmi: number;
  monthlyEssentials: number;
  bufferContribution: number;
  safeNewEmi: number;
  ltvBasedCapacity: number;
  sources: string[];
}

export function assessAffordability(input: BorrowerInput): AffordabilityBreakdown {
  const lenderCap = lenderFoirCap(input.employment);
  const safeCap = safeFoirCap(input.employment);

  const { income: totalIncome, declared, sources } = effectiveMonthlyIncome(input);

  const totalIncomeKnown = declared !== null || input.employment === 'self_employed';
  // Unknown existing EMI is treated as 0 for the FOIR calculation, with a
  // warning (see rules.ts). This gives the borrower a USEFUL upper-bound
  // capacity number even when they don't know the exact total. Strict
  // interpretation (treating unknown as infinite debt) would produce 0
  // capacity, which is unhelpful and rarely honest — many borrowers don't
  // know their EMI total offhand.
  const existingEmi = moneyValue(input.existingEmi, 0);
  const baseEssentials = moneyValue(input.monthlyEssentials, 0);
  const essentialsKnown = !isUnknown(input.monthlyEssentials);
  // Dependents add a per-person uplift to the implicit essentials floor.
  // Used when the borrower did not provide an explicit essentials figure, or
  // to add a small additional reserve even when they did.
  const depCount = input.dependents ?? 0;
  const depUplift = (input.employment === 'informal' || input.employment === 'self_employed')
    ? depCount * 3000
    : depCount * 2000;
  const essentials = essentialsKnown ? baseEssentials + (depCount > 0 ? depUplift : 0) : baseEssentials;

  const bufferMonths = input.emergencyBufferMonths ?? 3;
  const bufferContribution = essentialsKnown
    ? (essentials * bufferMonths) / 36
    : 0;

  // LENDER side: principal from FOIR headroom.
  const lenderEmiRoom = Math.max(0, totalIncome * lenderCap - existingEmi);
  const product = recommendProduct(input);
  const assumedLenderRate = productAssumedRateForCapacity(product);
  const lenderCapacityUnknown = !totalIncomeKnown;
  // The principal a borrower can carry is the principal that fits within the
  // capped tenure (loan must end by age 60). Using the raw requested tenure
  // would let an older borrower qualify for a bigger loan than a shorter
  // tenure would actually allows.
  const requestedMonths = maxTenureForAge(input.age, input.requestedTenureMonths);
  const lenderByFoir = lenderCapacityUnknown
    ? 0
    : principalFromEmi(lenderEmiRoom, assumedLenderRate, requestedMonths);

  // LTV-based cap (collateral × LTV).
  const ltv = input.collateralLtv ?? 0.7;
  const collateralV = moneyValue(input.collateralValue ?? undefined, 0);
  const ltvBasedCapacity = input.hasCollateral && collateralV > 0
    ? collateralV * ltv
    : 0;

  // For secured products, lender will use the LARGER of FOIR-based or
  // LTV-based, since the loan is asset-backed.
  const isSecuredProduct = product === 'lap' || product === 'business_loan' || product === 'gold_loan' || product === 'vehicle_loan' || product === 'home_loan';
  const lenderSanctionMax = isSecuredProduct
    ? Math.max(lenderByFoir, ltvBasedCapacity)
    : lenderByFoir;

  // BORROWER SAFE side: take the MIN of two ceilings, and additionally cap by
  // a smaller LTV haircut on collateral (60% vs the lender's 70%).
  const safeEmiByFoir = Math.max(0, totalIncome * safeCap - existingEmi);
  const safeEmiByCashflow = essentialsKnown
    ? Math.max(0, totalIncome - existingEmi - essentials - bufferContribution)
    : safeEmiByFoir;
  const safeNewEmi = Math.min(safeEmiByFoir, safeEmiByCashflow);

  const safeCapacityUnknown = !totalIncomeKnown;
  const borrowerSafeByEmi = safeCapacityUnknown
    ? 0
    : principalFromEmi(safeNewEmi, assumedLenderRate, requestedMonths);

  // Borrower-safe LTV haircut — for secured products the borrower can safely
  // carry the LTV-derived figure (asset absorbs risk) as long as the EMI is
  // comfortably under income. We use MAX of (EMI-derived) and a conservative
  // LTV haircut when the EMI ceiling is non-binding. This keeps the safe
  // number bounded by either the FOIR/cashflow or the LTV — never both.
  const safeLtvCapacity = input.hasCollateral && collateralV > 0
    ? collateralV * Math.max(0, ltv - 0.1)
    : 0;
  // Take whichever is SMALLER for unsecured, but for secured products where
  // the asset is the dominant safety, allow LTV to lift the floor above the
  // FOIR-derived figure when income is too thin to support FOIR but the asset
  // is sound.
  const borrowerSafeCapacity = isSecuredProduct && safeLtvCapacity > borrowerSafeByEmi
    ? safeLtvCapacity
    : isSecuredProduct
      ? borrowerSafeByEmi
      : borrowerSafeByEmi;

  // Recommendation: smaller of (requested, safe). Verdict may force 0.
  const requested = moneyValue(input.requestedAmount, 0);
  let recommended = Math.min(requested, borrowerSafeCapacity);
  if (!input.requestedAmount || (input.requestedAmount.kind === 'known' && input.requestedAmount.value === 0)) {
    recommended = 0;
  }

  const foirAfterSafe = totalIncome > 0
    ? (existingEmi + safeNewEmi) / totalIncome
    : 0;

  return {
    lenderSanctionMax: round0(lenderSanctionMax),
    borrowerSafeCapacity: round0(borrowerSafeCapacity),
    recommendedCapacity: round0(recommended),
    lenderCapacityUnknown,
    safeCapacityUnknown,
    lenderFoirCap: lenderCap,
    safeFoirCap: safeCap,
    foirAfterSafe,
    totalIncome: round0(totalIncome),
    totalIncomeKnown,
    existingEmi: round0(existingEmi),
    monthlyEssentials: round0(essentials),
    bufferContribution: round0(bufferContribution),
    safeNewEmi: round0(safeNewEmi),
    ltvBasedCapacity: round0(ltvBasedCapacity),
    sources,
  };
}

/** Internal product-rate assumption for back-solving principal from EMI. */
function productAssumedRateForCapacity(product: ReturnType<typeof recommendProduct>): number {
  switch (product) {
    case 'lap':
      return 11; // ~middle of LAP band
    case 'business_loan':
      return 14;
    case 'gold_loan':
      return 10.5;
    case 'vehicle_loan':
      return 10.5;
    case 'home_loan':
      return 9;
    case 'consumer_durable':
      return 16;
    default:
      return 13;
  }
}

export { flagMissing };