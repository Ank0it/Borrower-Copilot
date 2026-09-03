// ============================================================================
// Verdict engine (O1)
// ----------------------------------------------------------------------------
// Returns one of:
//   "Borrow"        — safe capacity covers the requested amount
//   "Borrow Less"   — safe capacity < requested, but borrow a smaller amount
//   "Don't Borrow"  — recent bounce + high-cost debt, or sustainability fails
//
// Reasons are always an array of borrower-specific sentences — never a generic
// risk disclaimer.
// ============================================================================
import type { BorrowerInput, Verdict, VerdictOutput } from './types';
import { emi } from './math';
import { pct, inr as inr0 } from './money';
import { assessAffordability } from './affordability';
import { assessRate } from './rates';
import { labelEmployment, productLabel } from './products';

export function assessVerdict(input: BorrowerInput): VerdictOutput {
  const reasons: string[] = [];
  let verdict: Verdict = 'Borrow';
  let ruleId = 'R-AFFORD';
  const aff = assessAffordability(input);
  const rate = assessRate(input);

  // ---- Hard "Don't Borrow" triggers (R05 family) ----

  // Bounce + high-cost debt → debt-trap risk.
  if (
    input.recentBounces.kind === 'known' &&
    input.recentBounces.value >= 1 &&
    input.highInterestDebtRatio > 0.25
  ) {
    verdict = "Don't Borrow";
    ruleId = 'R05';
    reasons.push(
      `Recent EMI bounce (${input.recentBounces.value}) plus ${pct(input.highInterestDebtRatio)} of income already servicing high-cost debt is a classic debt-trap pattern — a fresh loan would deepen the strain, not solve it.`,
    );
  }

  // High-cost debt dominates income.
  if (input.highInterestDebtRatio > 0.5 && verdict !== "Don't Borrow") {
    verdict = "Don't Borrow";
    ruleId = 'R05';
    reasons.push(
      `${pct(input.highInterestDebtRatio)} of income is already going to high-interest debt — new credit would extend, not retire, the burden.`,
    );
  }

  // Sustainability failure: full ask blows past the lender cap by a margin.
  const totalIncome = aff.totalIncome;
  const proposedEmiFull = emi(
    input.requestedAmount.kind === 'known' ? input.requestedAmount.value : 0,
    rate.rateMin,
    input.requestedTenureMonths,
  );
  const fullFoir = totalIncome > 0 ? (aff.existingEmi + proposedEmiFull) / totalIncome : 1;
  const lenderCap = aff.lenderFoirCap;
  // Only trigger "Don't Borrow" for unaffordability if there is no smaller
  // amount that would fit. If safe capacity is > 0, we can still Borrow Less.
  if (
    fullFoir > lenderCap + 0.05 &&
    aff.borrowerSafeCapacity <= 0 &&
    verdict !== "Don't Borrow"
  ) {
    verdict = "Don't Borrow";
    ruleId = 'R-AFFORD';
    reasons.push(
      `Taking the full ₹${input.requestedAmount.kind === 'known' ? input.requestedAmount.value.toLocaleString('en-IN') : '?'} would push your fixed obligations to ${pct(fullFoir)} of income, and even a reduced amount would not fit the conservative borrower cap.`,
    );
  }

  // Income documentation insufficient for the requested size (self-employed with
  // no ITR asking for a large loan).
  if (
    input.employment === 'self_employed' &&
    input.incomeDocumentation !== 'itr' &&
    input.requestedAmount.kind === 'known' &&
    input.requestedAmount.value >= 500000 &&
    verdict !== "Don't Borrow"
  ) {
    verdict = "Don't Borrow";
    ruleId = 'R-DOC';
    reasons.push(
      `Self-employed without filed ITR asking for ≥₹5,00,000 — most lenders will not underwrite this at any reasonable rate.`,
    );
  }

  // ---- "Borrow Less" triggers (mild) ----

  if (verdict === 'Borrow') {
    if (input.recentBounces.kind === 'known' && input.recentBounces.value >= 1) {
      verdict = 'Borrow Less';
      ruleId = 'R05';
      reasons.push(
        `${input.recentBounces.value} recent EMI bounce(s) signal cash-flow strain — borrow a smaller amount or extend tenure.`,
      );
    }
    if (
      input.requestedAmount.kind === 'known' &&
      aff.recommendedCapacity > 0 &&
      input.requestedAmount.value > aff.recommendedCapacity * 1.05
    ) {
      verdict = 'Borrow Less';
      ruleId = 'R-AFFORD';
      reasons.push(
        `Your safe capacity is ₹${aff.recommendedCapacity.toLocaleString('en-IN')}, but your ask is ₹${input.requestedAmount.value.toLocaleString('en-IN')}. Borrowing the safe amount keeps the EMI inside your budget.`,
      );
    }
    if (
      input.employment === 'self_employed' &&
      input.incomeDocumentation !== 'itr' &&
      input.requestedAmount.kind === 'known' &&
      input.requestedAmount.value < 500000 &&
      input.requestedAmount.value > 0
    ) {
      verdict = 'Borrow Less';
      ruleId = 'R-DOC';
      reasons.push(
        `Without ITR, lenders will downsize your limit or charge a higher rate — plan for the lower end of the band.`,
      );
    }
  }

  // ---- Debt-consolidation context (informational; does not change verdict) ----
  if (
    input.purpose === 'debt_consolidation' &&
    input.highCostDebtOutstanding &&
    input.highCostDebtOutstanding.kind === 'known' &&
    input.highCostDebtOutstanding.value > 0
  ) {
    reasons.push(
      `Debt-consolidation ask: retiring ${inr0(input.highCostDebtOutstanding.value)} of high-cost outstanding at a lower rate would reduce your monthly outflow rather than add to it.`,
    );
  }

  // ---- Default Borrow reasoning ----
  if (verdict === 'Borrow' && reasons.length === 0) {
    reasons.push(
      `Your FOIR after this loan (${pct(aff.foirAfterSafe)}) sits inside the conservative ${pct(aff.safeFoirCap)} safe cap for ${labelEmployment(input.employment)} borrowers, and no critical risk flags are present.`,
    );
    reasons.push(
      `Recommended product: ${productLabel(rate.recommendedProduct)} at ${rate.rateMin}%–${rate.rateMax}% p.a. headline (estimated APR ${rate.aprMin}%–${rate.aprMax}%).`,
    );
  }

  const summary =
    verdict === "Don't Borrow"
      ? reasons[0]
      : verdict === 'Borrow Less'
        ? `Conditional yes — but borrow less: ${reasons[0]}`
        : `Yes, with the following check: ${reasons[0]}`;

  return {
    verdict,
    reason: summary,
    reasons,
    ruleId,
  };
}