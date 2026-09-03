// ============================================================================
// Persona presets (Priya / Ravi / Anita)
// ----------------------------------------------------------------------------
// Inputs reflect the assignment brief. Cash ranges, documented income, and
// spouse-availability flags are explicit where the brief describes them.
// ============================================================================
import type { BorrowerInput } from './types';
import { moneyKnown, countKnown } from './money';

export interface Persona {
  label: string;
  description: string;
  input: BorrowerInput;
}

export const PERSONAS = {
  priya: {
    label: 'Priya — Salaried Engineer',
    description: '29, Bengaluru, salaried MNC, ₹1.1L/mo, car EMI ₹14k, CIBIL 780, wants ₹8L PL',
    input: {
      age: 29,
      employment: 'salaried',
      netMonthlyIncome: moneyKnown(110000),
      householdExtraIncome: undefined,
      householdIncomeAvailableForLoan: undefined,
      documentedMonthlyIncome: undefined,
      businessVintageYears: undefined,
      incomeDocumentation: 'payslips',
      existingEmi: moneyKnown(14000),
      highInterestDebtRatio: 0,
      highCostDebtOutstanding: moneyKnown(0),
      existingLoanCount: 1,
      monthlyEssentials: moneyKnown(28000 + 10000), // rent 28k + living 10k
      dependents: 0,
      emergencyBufferMonths: 3,
      purpose: 'wedding',
      requestedAmount: moneyKnown(800000),
      requestedTenureMonths: 48,
      cibilScore: 780,
      recentBounces: countKnown(0),
      hasCollateral: false,
      collateralValue: undefined,
      collateralLtv: undefined,
    },
  },
  ravi: {
    label: 'Ravi — Kirana Owner',
    description: '42, Mysuru, self-employed kirana 14yrs, cash ₹40–80k/mo + ITR ₹4.2L/yr, ₹45L unencumbered shop, wife ₹18k teacher, no score, wants ₹15L',
    input: {
      age: 42,
      employment: 'self_employed',
      // Use the midpoint of the cash range as the declared net.
      // The documented ITR income is the *cap* on what counts for FOIR.
      netMonthlyIncome: moneyKnown(60000), // midpoint of 40–80k
      cashIncomeRange: { min: 40000, max: 80000 },
      // ITR filed: ₹4.2L / 12 = ₹35,000/mo. Lender will recognise this, not the full 60k.
      documentedMonthlyIncome: moneyKnown(35000),
      householdExtraIncome: moneyKnown(18000),
      // For Ravi's productive LAP, the wife is a working co-applicant.
      // The questionnaire asks this explicitly so the borrower can choose.
      householdIncomeAvailableForLoan: true,
      businessVintageYears: 14,
      incomeDocumentation: 'itr',
      existingEmi: moneyKnown(0),
      highInterestDebtRatio: 0,
      highCostDebtOutstanding: moneyKnown(0),
      existingLoanCount: 0,
      monthlyEssentials: moneyKnown(35000),
      dependents: 2,
      emergencyBufferMonths: 3,
      purpose: 'business',
      requestedAmount: moneyKnown(1500000),
      requestedTenureMonths: 60,
      cibilScore: null,
      recentBounces: countKnown(0),
      hasCollateral: true,
      collateralValue: moneyKnown(4500000),
      collateralLtv: 0.7,
    },
  },
  anita: {
    label: 'Anita — Delivery Rider',
    description: '35, Hubballi, informal rider + tailoring, ₹26–30k/mo, 2 kids, husband unemployed, 3 app loans ₹35k @ 30%+, 1 bounce, wants ₹1.5L EV',
    input: {
      age: 35,
      employment: 'informal',
      netMonthlyIncome: moneyKnown(28000), // midpoint of 26–30k
      cashIncomeRange: { min: 26000, max: 30000 },
      householdExtraIncome: moneyKnown(0),
      householdIncomeAvailableForLoan: false,
      documentedMonthlyIncome: undefined,
      businessVintageYears: 3,
      incomeDocumentation: 'bank_statement',
      existingEmi: moneyKnown(9000), // sum of 3 app-loan EMIs
      highInterestDebtRatio: 0.3,
      highCostDebtOutstanding: moneyKnown(35000),
      existingLoanCount: 3,
      monthlyEssentials: moneyKnown(18000),
      dependents: 2,
      emergencyBufferMonths: 3,
      purpose: 'vehicle',
      requestedAmount: moneyKnown(150000),
      requestedTenureMonths: 24,
      cibilScore: null,
      recentBounces: countKnown(1),
      hasCollateral: false,
      collateralValue: undefined,
      collateralLtv: undefined,
    },
  },
} as const satisfies Record<string, Persona>;

export type PersonaName = keyof typeof PERSONAS;