// ============================================================================
// Products: routing + product metadata
// ============================================================================
import type { LoanProduct, LoanPurpose, EmploymentType } from './types';

export interface ProductMeta {
  id: LoanProduct;
  label: string;
  isSecured: boolean;
  defaultLtv?: number;
}

/** Reference table — kept short, only the products we actually recommend. */
export const PRODUCTS: Record<LoanProduct, ProductMeta> = {
  personal_loan: {
    id: 'personal_loan',
    label: 'Personal Loan',
    isSecured: false,
  },
  lap: {
    id: 'lap',
    label: 'Loan Against Property (LAP)',
    isSecured: true,
    defaultLtv: 0.7,
  },
  business_loan: {
    id: 'business_loan',
    label: 'Business Loan',
    isSecured: false,
  },
  gold_loan: {
    id: 'gold_loan',
    label: 'Gold Loan',
    isSecured: true,
    defaultLtv: 0.75,
  },
  vehicle_loan: {
    id: 'vehicle_loan',
    label: 'Vehicle Loan',
    isSecured: true,
    defaultLtv: 0.85,
  },
  home_loan: {
    id: 'home_loan',
    label: 'Home Loan',
    isSecured: true,
    defaultLtv: 0.8,
  },
  consumer_durable: {
    id: 'consumer_durable',
    label: 'Consumer Durable Loan',
    isSecured: false,
  },
};

export function productLabel(p: LoanProduct): string {
  return PRODUCTS[p].label;
}

export function productIsSecured(p: LoanProduct): boolean {
  return PRODUCTS[p].isSecured;
}

export function labelEmployment(emp: 'salaried' | 'self_employed' | 'informal'): string {
  switch (emp) {
    case 'salaried':
      return 'salaried';
    case 'self_employed':
      return 'self-employed';
    case 'informal':
      return 'informal';
  }
}

/**
 * Recommends a product given the borrower profile.
 * - Self-employed with collateral and sizable ask → LAP (R04).
 * - Self-employed with productive business purpose → business loan.
 * - Vehicle purpose → vehicle loan (auto).
 * - Home renovation of ≥10L → home loan.
 * - Otherwise → personal loan.
 */
export function recommendProduct(input: {
  employment: EmploymentType;
  hasCollateral: boolean;
  requestedAmount: { kind: 'known'; value: number } | { kind: 'unknown' };
  purpose: LoanPurpose;
}): LoanProduct {
  const requested = input.requestedAmount.kind === 'known' ? input.requestedAmount.value : 0;

  const collateralAvailable =
    input.hasCollateral && (input.employment === 'self_employed' || input.employment === 'informal');

  if (input.employment === 'self_employed' && collateralAvailable && requested >= 500000) {
    return 'lap';
  }

  if (input.employment === 'self_employed' && input.purpose === 'business') {
    return 'business_loan';
  }

  if (input.purpose === 'vehicle') {
    return 'vehicle_loan';
  }

  if (input.purpose === 'home_renovation' && requested >= 1000000) {
    return 'home_loan';
  }

  return 'personal_loan';
}

/**
 * Capacity the collateral itself supports (LTV × collateral value).
 * Returns 0 if no collateral.
 */
export function collateralCapacity(
  hasCollateral: boolean,
  collateralValue: number | undefined,
  productLtv: number,
): number {
  if (!hasCollateral || !collateralValue || collateralValue <= 0) return 0;
  return collateralValue * productLtv;
}