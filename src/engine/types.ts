// ============================================================================
// Borrower Copilot — Engine: Type definitions
// ----------------------------------------------------------------------------
// Input model uses explicit "known | unknown" semantics for every financially
// meaningful field. Zero is reserved for "known to be zero".
// ============================================================================

export type EmploymentType = 'salaried' | 'self_employed' | 'informal';

export type LoanPurpose =
  | 'personal'
  | 'wedding'
  | 'home_renovation'
  | 'medical'
  | 'education'
  | 'vehicle'
  | 'business'
  | 'stock'
  | 'debt_consolidation'
  | 'other';

export type LoanProduct =
  | 'personal_loan'
  | 'lap'
  | 'business_loan'
  | 'gold_loan'
  | 'vehicle_loan'
  | 'home_loan'
  | 'consumer_durable';

export type IncomeDoc = 'payslips' | 'itr' | 'bank_statement' | 'none';

export type Confidence = 'low' | 'medium' | 'high';

/** Either a known positive number or explicitly unknown. */
export type Money = { kind: 'known'; value: number } | { kind: 'unknown' };

/** Either a known integer count or explicitly unknown. */
export type Count = { kind: 'known'; value: number } | { kind: 'unknown' };

/** Cash income range — used for self-employed/informal where income varies. */
export interface CashRange {
  min: number;
  max: number;
}

export interface BorrowerInput {
  // ----- core identification -----
  age: number;

  // ----- employment & income -----
  employment: EmploymentType;
  /** Net monthly income from the primary borrower — only the documented portion
   *  for self-employed, the payslip amount for salaried. */
  netMonthlyIncome: Money;
  /** Cash income range — relevant for self-employed and informal borrowers.
   *  Only `documentedMonthlyIncome` (or netMonthlyIncome) is used for FOIR;
   *  the cash range widens the rate band and lowers confidence. */
  cashIncomeRange?: CashRange;
  /** Spouse / household extra monthly income. */
  householdExtraIncome?: Money;
  /** Whether the spouse income is realistically available to service this loan
   *  (e.g. as a co-applicant). If unknown, only net income is used. */
  householdIncomeAvailableForLoan?: boolean;
  /** Self-employed only: monthly income as per filed ITR / audited books. */
  documentedMonthlyIncome?: Money;
  /** Years the business has been operating (self-employed / informal). */
  businessVintageYears?: number;
  /** How the primary income is documented. */
  incomeDocumentation: IncomeDoc;

  // ----- existing obligations -----
  /** Sum of all existing EMI outflows in INR. */
  existingEmi: Money;
  /** Share of income (0..1) currently servicing loans charging > 25% interest. */
  highInterestDebtRatio: number;
  /** Outstanding principal on existing high-cost loans (₹). */
  highCostDebtOutstanding?: Money;
  /** Number of existing loan lines. */
  existingLoanCount?: number;

  // ----- household -----
  /** Essential monthly expenses (rent, school, groceries, utilities, EMI of
   *  existing loans if treated as essential). Excludes discretionary spend. */
  monthlyEssentials: Money;
  /** Number of dependents. Affects safe-cap buffer. */
  dependents?: number;
  /** Emergency buffer target in months of essentials. */
  emergencyBufferMonths?: number;

  // ----- the loan itself -----
  purpose: LoanPurpose;
  /** Requested principal in INR. */
  requestedAmount: Money;
  requestedTenureMonths: number;

  // ----- bureau & history -----
  /** Bureau score (300–900). null = unknown. */
  cibilScore: number | null;
  /** Last 12-month EMI bounces. */
  recentBounces: Count;

  // ----- collateral -----
  hasCollateral: boolean;
  collateralValue?: Money;
  /** Approx LTV the lender will allow (default 0.7 for LAP). */
  collateralLtv?: number;
}

export interface EngineJustification {
  text: string;
  ruleId: string;
}

export type Verdict = 'Borrow' | 'Borrow Less' | "Don't Borrow";

export interface VerdictOutput {
  verdict: Verdict;
  reason: string;
  /** Specific reasons surfaced in plain English from rule outputs. */
  reasons: string[];
  ruleId: string;
}

export interface CapacityOutput {
  /** What a lender will likely approve, based on FOIR-style cap. */
  lenderSanctionMax: number;
  /** Conservative cap the borrower can safely carry. Always ≤ lender max. */
  borrowerSafeCapacity: number;
  /** What we tell the borrower to actually borrow. */
  recommendedCapacity: number;
  /** Effective FOIR after the safe EMI is added to existing EMIs. */
  foirAfterSafe: number;
  /** FOIR-style cap used in the lender-side calculation. */
  lenderFoirCap: number;
  /** Conservative cap used in the borrower-side calculation (≤ lender cap). */
  safeFoirCap: number;
  rationaleLender: EngineJustification;
  rationaleSafe: EngineJustification;
  rationaleRecommended: EngineJustification;
}

export interface RateOutput {
  /** Headline interest-rate band (nominal, %). */
  rateMin: number;
  rateMax: number;
  /** All-in APR band (estimated). See apr.ts for methodology. */
  aprMin: number;
  aprMax: number;
  /** Processing fee as % of principal (one-time, paid upfront). */
  processingFeePct: number;
  /** Recommended product. */
  recommendedProduct: LoanProduct;
  rationaleBand: EngineJustification;
  rationaleApr: EngineJustification;
  rationaleProduct: EngineJustification;
}

export interface StressScenario {
  label: string;
  stressedSafeEmi: number;
  stressedEmi: number;
  survives: boolean;
  rationale: EngineJustification;
}

export interface StressOutput {
  safeEmi: number;
  proposedEmi: number;
  /** Tenure options for the recommended principal, at the midpoint rate. */
  tenureOptions: { months: number; emi: number; totalInterest: number }[];
  scenarios: StressScenario[];
  rationaleSafeEmi: EngineJustification;
}

export interface ConfidenceOutput {
  level: Confidence;
  /** 0..1 — derived from how many material inputs were answered. */
  score: number;
  missingCritical: string[];
  rationale: EngineJustification;
}

export interface EngineResult {
  verdict: VerdictOutput;
  capacity: CapacityOutput;
  rate: RateOutput;
  stress: StressOutput;
  confidence: ConfidenceOutput;
  warnings: string[];
  recommendedTenureMonths: number;
}