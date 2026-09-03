# Business Rules & Decision Engine Specs

Every rule, threshold, and assumption used by the application core is documented here. The columns are:

- **What** — what the rule controls
- **Value** — concrete number or formula
- **Why** — short justification
- **Source / Judgement** — `SOURCE` (a real reference), `MY JUDGEMENT` (an explicit judgement call), or `SIMPLIFIED ASSUMPTION` (a deliberate simplification of a more complex real rule).

> If you change a value here, update `src/engine/*.ts` to match. If you change a value in code, update this table. They must stay in sync.

---

## 1. Affordability — FOIR-style caps

| What | Value | Why | Source / Judgement |
| :--- | :--- | :--- | :--- |
| Lender FOIR cap, salaried | **50%** of reliable monthly income | Standard ceiling used by most Indian retail banks for salaried borrowers. | MY JUDGEMENT (calibrated to common Indian retail practice; not a regulator-mandated number) |
| Lender FOIR cap, self-employed | **40%** | Lower ceiling because ITR income and cash income do not always match. | MY JUDGEMENT |
| Lender FOIR cap, informal | **30%** | High income volatility, no social safety net. | MY JUDGEMENT |
| Safe borrower FOIR cap, salaried | **40%** (10 pts under lender cap) | Borrower needs a 10-point cushion under the lender ceiling for income volatility. | MY JUDGEMENT |
| Safe borrower FOIR cap, self-employed | **30%** | Same logic. | MY JUDGEMENT |
| Safe borrower FOIR cap, informal | **20%** | Same logic, tighter because volatility is highest. | MY JUDGEMENT |
| Emergency buffer contribution | `(essentials × months) ÷ 36` per month | Builds a 3-month essentials buffer over 3 years; subtracted from disposable income so the safe figure does not assume the borrower spends every rupee. | MY JUDGEMENT |
| Default buffer target | **3 months** of essentials | Common Indian financial-planning default. | MY JUDGEMENT |

## 2. Income treatment

| What | Value | Why | Source / Judgement |
| :--- | :--- | :--- | :--- |
| Salaried income | `netMonthlyIncome` (payslip net) | Payslips are lender-recognised. | SOURCE — payslip is standard retail underwriting evidence |
| Self-employed income | `min(declared, documentedMonthlyIncome)` | Lender will use ITR/audited figure, not the cash range midpoint. We refuse to overstate capacity on the borrower's claim alone. | MY JUDGEMENT |
| Informal income | `netMonthlyIncome` if known; midpoint of `cashIncomeRange` if not | When only a range is given we use the midpoint; confidence lowers and rate band widens. | MY JUDGEMENT |
| Spouse income | Only counted if `householdIncomeAvailableForLoan === true` | Application must explicitly ask whether the spouse is a co-applicant; we never assume. | MY JUDGEMENT |
| Unknown income | Income figure treated as 0 for FOIR, confidence = LOW | We will not silently fabricate capacity from missing data. | MY JUDGEMENT |

## 3. Existing obligations

| What | Value | Why | Source / Judgement |
| :--- | :--- | :--- | :--- |
| Existing EMI | Subtracted from FOIR headroom | Standard underwriting. | SOURCE — standard retail practice |
| Unknown EMI | Capacity calculated *without* subtracting them, with a warning | Conservative — better to understate capacity than to invent false headroom. | MY JUDGEMENT |
| High-cost debt share | Triggers `Don't Borrow` if ≥25% AND ≥1 recent bounce, or >50% alone | Prevents debt-trap borrowing (R05). | MY JUDGEMENT — debt-trap pattern observed in micro-credit literature |
| Bounce count | Triggers `Don't Borrow` only when combined with high-cost debt; otherwise `Borrow Less` | One bounce alone is recoverable; bounce + high-cost debt is a debt-trap signal. | MY JUDGEMENT |

## 4. Unknown vs zero vs N/A

| Field | Allowed states | Treatment of `unknown` |
| :--- | :--- | :--- |
| `netMonthlyIncome` | known number / unknown | Treated as 0 for FOIR; warning issued; confidence lowered. |
| `existingEmi` | known number / unknown | Capacity computed without subtracting; warning issued. |
| `monthlyEssentials` | known number / unknown | Safe-capacity ceiling falls back to the FOIR-style cap (no disposable-income deduction); warning issued. |
| `recentBounces` | known count / unknown | Triggers no debt-trap verdict; confidence lowered; rate band does not assume zero bounces. |
| `cibilScore` | known 300–900 / unknown (null) | Unknown widens rate band ±2%; not treated as 0. |
| `cashIncomeRange` | optional object | If provided, widens rate band for volatility. |
| `householdIncomeAvailableForLoan` | boolean | Defaults to false. |
| `incomeDocumentation` | payslips / itr / bank_statement / none | Affects rate band and verdict for self-employed/informal. |

## 5. Credit score

| Band | CIBIL | Rate-band adjustment |
| :--- | :--- | :--- |
| Prime | ≥780 | Tightens upper end by −1.5% |
| Mid-prime | 740–779 | Tightens upper end by −0.5% |
| Sub-prime | 700–739 | Widens +1% / +1% |
| Low-prime | <700 | Widens +3% / +5% |
| Unknown | null | Widens ±2% symmetrically (separate from risk adjustment) |

Source: MY JUDGEMENT — calibrated to Indian retail CIBIL pricing tiers.

## 6. Product routing

| Condition | Product |
| :--- | :--- |
| Self-employed + unencumbered collateral + ask ≥ ₹5L | **LAP (Loan Against Property)** |
| Self-employed + business purpose | **Business Loan** |
| Any borrower, vehicle purpose | **Vehicle Loan** |
| Any borrower, home renovation + ask ≥ ₹10L | **Home Loan** |
| Otherwise | **Personal Loan** |
| Self-employed, no ITR, ask ≥ ₹5L | Verdict becomes `Don't Borrow` (insufficient documentation) |
| Informal, undocumented, ask ≥ ₹5L | Verdict becomes `Don't Borrow` (insufficient documentation) |

## 7. Rate bands (product baseline)

| Product | Min | Max | Processing fee |
| :--- | :--- | :--- | :--- |
| Personal Loan (salaried) | 10.99% | 16% | 2.00% |
| Personal Loan (self-employed) | 14% | 22% | 2.50% |
| Personal Loan (informal) | 18% | 28% | 3.00% |
| LAP (salaried/self-employed) | 10% | 12.5% | 1.00% |
| LAP (informal) | 14% | 18% | 1.50% |
| Business Loan (self-employed) | 14% | 22% | 2.00% |
| Business Loan (informal) | 18% | 28% | 2.50% |
| Gold Loan | 9% | 12% | 0.50% |
| Vehicle Loan | 9.5% | 11.5% | 1.00% |
| Home Loan | 8.5% | 10% | 0.50% |
| Consumer Durable | 16% | 26% | 3.00% |

Risk adjustment and credit-score uncertainty are added on top.

Source: MY JUDGEMENT — calibrated to current Indian retail market medians. Not a single lender's published rate card.

## 8. Rate risk adjustments

| Signal | Adjustment |
| :--- | :--- |
| Prime CIBIL (≥780) | Tightens upper end by −1.5% |
| Mid-prime (740–779) | Tightens upper end by −0.5% |
| Sub-prime (700–739) | Widens +1% / +1% |
| Low CIBIL (<700) | Widens +3% / +5% |
| ≥1 recent EMI bounce | Widens +1% / +2% |
| High-cost debt share >25% | Widens +1% / +2% |
| Income undocumented (informal) | Widens +3% / +5% |
| Bank-statement-only (informal) | Widens +1% / +2% |
| No ITR / audited financials (self-employed) | Widens +2% / +3% |
| Cash income spread ≥50% of max | Widens +1% / +1% |
| Unknown CIBIL (separate channel) | Widens ±2% symmetrically |

## 9. Secured loans — LTV treatment

| What | Value | Why | Source / Judgement |
| :--- | :--- | :--- | :--- |
| Default LAP LTV | **70%** of collateral value | Common Indian LAP lending cap. | MY JUDGEMENT |
| Default gold LTV | 75% | Common Indian gold-loan cap. | MY JUDGEMENT |
| Default vehicle LTV | 85% | Common Indian vehicle-loan cap. | MY JUDGEMENT |
| Default home LTV | 80% | Common Indian home-loan cap. | MY JUDGEMENT |
| Borrower safe LTV | Lender LTV − 10% | Borrower-side haircut. | MY JUDGEMENT |
| Lender sanction for secured product | `MAX(FOIR-based, LTV-based)` | A secured loan can be sized by either cash-flow or asset — use whichever is larger. | MY JUDGEMENT |
| Borrower safe capacity for secured product | `MAX(EMI-derived, safe-LTV)` when LTV is non-binding | The asset absorbs part of the risk; safe figure can be lifted by LTV. | MY JUDGEMENT |

## 10. Confidence model

| Score | Level |
| :--- | :--- |
| ≥ 0.8 | HIGH |
| ≥ 0.5 | MEDIUM |
| < 0.5 | LOW |

| Variable | Weight | Missing penalty |
| :--- | :--- | :--- |
| Net monthly income | 0.18 | LOW cap |
| Cash income range | 0.07 | MEDIUM cap on rate precision |
| Existing EMIs | 0.16 | conservative capacity |
| Monthly essentials | 0.14 | falls back to FOIR-only |
| Requested amount | 0.10 | safe capacity cannot be sized |
| Recent bounces | 0.08 | R05 cannot fire → confidence penalty |
| CIBIL score | 0.10 | widens rate band ±2% |
| Age | 0.04 | tenure cap may be wrong |
| Loan purpose | 0.03 | routing incomplete |
| Employment type | 0.05 | FOIR cap / product unknown |
| Tenure | 0.05 | EMI table incomplete |

## 11. APR methodology

`Estimated APR = nominal rate + (processing fee ÷ tenure in years)`.

- This is a **simplified RBI-style** methodology.
- The processing fee is paid upfront, so amortising it over the loan tenure is an approximation. A strict IRR-based APR would compute a slightly higher number.
- We exclude insurance premiums, stamp duty, and documentation charges, which can add 0.5–1.5% on retail loans.
- We label the result "**Estimated APR**" rather than "RBI-grade APR".

Reference: RBI Master Direction on Fair Practices (2012, as amended) requires lenders to disclose APR including all charges. We capture the processing fee but not the rest. See `src/engine/apr.ts` for the function.

Source: SIMPLIFIED ASSUMPTION — explicit simplification of RBI's full APR methodology.

## 12. Tenure / age

| What | Value | Why | Source / Judgement |
| :--- | :--- | :--- | :--- |
| Maximum sensible tenure | `(60 − age) × 12` months, min 12, capped at requested | Most lenders want the loan closed by the borrower's 60th birthday. | MY JUDGEMENT (most lenders follow this in India) |
| Tenure options shown | 24, 36, 48, 60, 84 months, capped by age | Useful trade-off table. | MY JUDGEMENT |

## 13. Stress test

| Scenario | Shock | Calculation |
| :--- | :--- | :--- |
| Income drop 20% (R08) | Income × 0.8 | Stressed safe EMI room = `(0.8 × income) − existing EMI − essentials` |
| Income drop 15% | Income × 0.85 | Same formula |
| Rate shock +200 bps | Rate floor + 2% | EMI recomputed at shocked rate; must fit inside today's EMI headroom |

| What | Why | Source / Judgement |
| :--- | :--- | :--- |
| 20% income drop | RBI/ILFS stress-test framework treats 20% as a "mild recession" scenario. | SIMPLIFIED ASSUMPTION |
| 200 bps rate shock | Captures a typical RBI policy rate hike cycle. | SIMPLIFIED ASSUMPTION |

## 14. Verdict thresholds

| Condition | Verdict | Source / Judgement |
| :--- | :--- | :--- |
| Recent bounce + >25% high-cost-debt share | `Don't Borrow` (R05) | MY JUDGEMENT — debt-trap pattern from micro-credit literature |
| High-cost-debt share >50% | `Don't Borrow` (R05) | MY JUDGEMENT |
| Self-employed, no ITR, ask ≥₹5L | `Don't Borrow` (R-DOC) | MY JUDGEMENT — banks typically won't underwrite this |
| Full ask FOIR > lender cap + 5 pts AND safe capacity = 0 | `Don't Borrow` (R-AFFORD) | MY JUDGEMENT — strict sustainability ceiling |
| Recent bounce (any high-cost share) | `Borrow Less` (R05) | MY JUDGEMENT — single bounce is recoverable but worth a warning |
| Full ask FOIR > lender cap, but safe capacity > 0 | `Borrow Less` | MY JUDGEMENT |
| Self-employed, no ITR, ask <₹5L | `Borrow Less` (R-DOC) | MY JUDGEMENT — limited underwriting |
| Otherwise | `Borrow` | — |

## 15. Edge cases & validation

| Input | Rule | Behaviour |
| :--- | :--- | :--- |
| Negative income / EMI / expenses / amount | `validate()` in `src/engine/money.ts` | Emits a validation warning; never crashes |
| Age < 18 or > 90 | `validate()` | Emits warning; age 18–90 expected |
| CIBIL < 300 or > 900 | `validate()` | Emits warning |
| Tenure < 3 or > 360 months | `validate()` | Emits warning |
| Empty / zero requested amount | UI | Recommendation = 0; verdict still produced |
| Missing requested amount | UI | Engine can still compute lender/safe; recommendation = 0 |

---

## 16. Honesty about limits

- The FOIR caps and rate bands are calibrated judgements, not RBI mandates.
- The APR estimate excludes insurance, stamp duty, and documentation charges.
- The lender sanction figure is what a typical lender *might* approve, not what a specific lender will approve.
- The safe-capacity figure is a borrower-side conservative number; it is not a guarantee that any lender will offer those terms.
- Stress-test scenarios are illustrative; real-life shocks compound (job loss + rate rise + medical event) and can be far worse than either alone.
- The engine cannot verify income, cannot pull a real bureau file, and cannot enforce that the borrower follows the recommendation.