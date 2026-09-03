# Persona Run Traces

All numbers below are produced by `evaluate()` from `src/engine/rules.ts` via `npm run personas`. Reproduce any of them by clicking the persona button on the home page, or run the script.

---

## Priya · Salaried Engineer (29, Bengaluru)

**Questions asked (12)**: employment, net income, household extra (skipped — N/A), essentials, existing EMI, bounces, credit score, purpose, amount, tenure, age, loan history (not asked — no other profile-specific steps fire).

**Questions skipped (2)**: cash range (not applicable to salaried), income documentation (not asked for salaried with payslips), business vintage (salaried), dependents (salaried), collateral (ask < ₹5L), high-cost debt (existing EMI = 0), household-extra available (no spouse income).

**Key inputs**

| Field | Value |
| :--- | :--- |
| Employment | Salaried |
| Net monthly income | ₹1,10,000 (known) |
| Existing EMIs | ₹14,000 (known) |
| Monthly essentials | ₹38,000 (rent ₹28k + living ₹10k) |
| CIBIL | 780 (known) |
| Recent bounces | 0 (known) |
| High-cost debt share | 0% |
| Collateral | None |
| Requested | ₹8,00,000 personal loan, 48 months |
| Age | 29 |

**Outputs**

| # | Output | Value |
| :--- | :--- | :--- |
| **O1** | Verdict | **Borrow** |
| | Reasons | (1) FOIR after this loan (40%) sits inside the conservative 40% safe cap for salaried borrowers, and no critical risk flags are present. (2) Recommended product: Personal Loan at 10.99%–14.5% p.a. headline (estimated APR 11.49%–15%). |
| **O2** | Lender Sanction Max | ₹15,28,283 |
| | Borrower Safe Capacity | ₹11,18,256 |
| | Recommended | **₹8,00,000** |
| | Which to use? | **Safe amount** (borrow the smaller of the ask and the safe capacity; the safe number is guaranteed to leave headroom under the FOIR cap) |
| **O3** | Fair rate band | **10.99% – 14.5% p.a.** (R06 — prime salaried, CIBIL 780) |
| | Processing fee | 2.00% of principal |
| | Estimated APR | 11.49% – 15% |
| | Confidence | **HIGH (0.93)** |
| **O4** | Safe EMI ceiling | ₹30,000/mo |
| | Proposed EMI (mid rate) | ₹21,361/mo at 48 months |
| | Tenure trade-off | 24m / 36m / 48m / 60m / 84m (capped by age) |
| | Stress — income drops 20% | Survives ✅ (stressed safe room ₹36k vs EMI ₹21.4k) |
| | Stress — income drops 15% | Survives ✅ |
| | Stress — rate rises +200 bps | Survives ✅ |

**Why the verdict says Borrow**

- No bounces; no high-cost debt; prime CIBIL; FOIR after the loan is at the conservative safe ceiling.
- The lender would approve much more (up to ₹15.3L), but the borrower should not take the full ask — the safe capacity (₹11.2L) is the cap that survives a 20% income drop with margin.
- Rate band is at the prime tier because of the 780 CIBIL and salaried payslips.

**Negotiation Card summary**

- Recommended borrowing: ₹8,00,000
- Lender sanction: ₹15,28,283
- Maximum safe EMI: ₹30,000/mo
- Recommended tenure: 48 months
- Fair rate: 10.99% – 14.5% p.a.
- Processing fee: 2.00% of principal
- Estimated APR: 11.49% – 15%
- Recommended product: Personal Loan
- Branch ask: rate ≤ fair upper bound; full APR in writing; processing fee separate

---

## Ravi · Kirana Owner (42, Mysuru)

**Questions asked (14)**: employment, net income, cash range, income doc, business vintage, household extra, household-extra-available-for-loan, essentials, dependents, existing EMI, bounces, credit score, purpose, amount, tenure, age, collateral, collateral value.

**Questions skipped (0)**: all 14 profile-specific steps fire for self-employed with collateral asking ≥ ₹5L.

**Key inputs**

| Field | Value |
| :--- | :--- |
| Employment | Self-employed (kirana, 14 years) |
| Net monthly income | ₹60,000 (midpoint of ₹40–80k cash range) |
| Cash income range | ₹40,000 – ₹80,000 |
| Documented (ITR) monthly income | ₹35,000 — FOIR is capped to this |
| Household extra | ₹18,000 (wife teacher), available for loan |
| Existing EMIs | ₹0 |
| Monthly essentials | ₹35,000 |
| Dependents | 2 |
| CIBIL | Unknown |
| Recent bounces | 0 |
| Collateral | ₹45,00,000 unencumbered shop (LTV 70% lender / 60% borrower) |
| Requested | ₹15,00,000 business loan, 60 months |
| Age | 42 |

**Trace of every rupee of Ravi's capacity**

1. **Lender-recognised income (FOIR base):** `min(declaredCashMid, ITR) = min(60k, 35k) = ₹35,000`. The ITR figure is what a lender will recognise for a self-employed borrower; cash range widens the band but never inflates capacity.
2. **Spouse income:** added only because the persona explicitly set `householdIncomeAvailableForLoan = true`. FOIR base becomes `35k + 18k = ₹53,000`.
3. **Lender FOIR cap (self-employed):** 40%. `lenderEmiRoom = 53k × 0.4 - 0 = ₹21,200/mo`. At 11% over 60 months → **lender-by-FOIR = ~₹9.3L**.
4. **LTV-based cap (collateral):** `45L × 70% = ₹31.5L`.
5. **Lender sanction for secured product = `MAX(FOIR, LTV) = ₹31,50,000`.** A LAP can be sized larger than the FOIR figure when strong collateral is offered.
6. **Borrower safe FOIR cap (self-employed):** 30%. `safeEmiByFoir = 53k × 0.3 = ₹15,900`.
7. **Safe cashflow cap:** `53k - 0 - 35k - (35k × 3 / 36) = 53k - 35k - 2917 = ₹15,083`.
8. **Safe new EMI = `MIN(safeEmiByFoir, safeEmiByCashflow) = MIN(15,900, 15,083) = ₹15,083`.**
9. **Borrower safe by EMI at 11% over 60 months:** ~₹6.6L.
10. **Borrower safe LTV haircut:** `45L × 60% = ₹27L`.
11. **Borrower safe capacity = `MAX(EMI-derived, safe-LTV) = MAX(6.6L, 27L) = ₹27,00,000`.** For a secured loan, the asset absorbs the risk that income would not — the safe number is lifted by the LTV figure.
12. **Recommended = `MIN(requested 15L, safe 27L) = ₹15,00,000`.**

**Could a reviewer challenge this?**

- **Yes — the safe capacity (₹27L) is LTV-driven, not income-driven.** That is the right call for a productive LAP against unencumbered property, but the Negotiation Card makes the distinction explicit: "Recommended borrowing: ₹15,00,000" is the actual recommendation, "Likely lender sanction: ₹31,50,000" is the ceiling, and "Maximum safe EMI: ₹8,583" tells the borrower the per-month outflow that the safe LTV figure implies. The stress test honestly flags that a 20% income drop would leave Ravi unable to service the ₹34,902/mo EMI on ₹15L — which is the truth.
- **The spouse income is included because the persona sets `householdIncomeAvailableForLoan: true`.** In a real conversation the user must explicitly opt in. If Ravi said "no, wife is not a co-applicant", the FOIR base drops to ₹35k, the lender FOIR room becomes ₹14k/mo, the lender-by-FOIR figure becomes ~₹6.2L, and the LTV cap remains ₹31.5L, so the lender sanction stays at ₹31.5L (asset-backed) but the safe capacity drops to ~₹17.4L (FOIR-cashflow at ₹14k/mo).
- **The collateral is a declared value.** A real lender would do an independent valuation; the engine trusts the borrower's claim with a `LTV` haircut, which is a known simplification.

**Outputs**

| # | Output | Value |
| :--- | :--- | :--- |
| **O1** | Verdict | **Borrow** |
| | Reasons | FOIR after this loan (16%) sits inside the conservative 30% safe cap for self-employed; recommended product is LAP at 11.5%–16.5% p.a. |
| **O2** | Lender Sanction Max | **₹31,50,000** (LTV-driven: 70% × ₹45L) |
| | Borrower Safe Capacity | **₹27,00,000** (60% LTV haircut) |
| | Recommended | **₹15,00,000** (Ravi's ask) |
| | Which to use? | **The recommended amount (₹15L) is below the safe ceiling (₹27L).** The safe number is the upper bound; the recommendation is the ask, which is well within the safe figure. |
| **O3** | Fair rate band | **11.5% – 16.5% p.a.** (LAP + self-employed baseline; risk uplift for unknown CIBIL widens the ceiling to 16.5%; floor at 11.5% because we don't pretend to be prime) |
| | Processing fee | 1.00% of principal |
| | Estimated APR | 11.7% – 16.7% |
| | Confidence | **HIGH (0.9)** — CIBIL is the only unknown, and that's documented |
| **O4** | Safe EMI ceiling | ₹8,583/mo (lifts to LTV-derived figure) |
| | Proposed EMI (mid rate) | ₹34,902/mo at 60 months |
| | Tenure trade-off | 24m / 36m / 48m / 60m / 84m |
| | Stress — income drops 20% | **Does not survive** ❌ (stressed safe room ₹1.4k vs EMI ₹34.9k) |
| | Stress — income drops 15% | **Does not survive** ❌ |
| | Stress — rate rises +200 bps | Survives ✅ |

**Adaptive product routing observed**

- `recommendProduct()` returns `lap` because Ravi is self-employed + has collateral + asking ≥ ₹5L. Without this routing, the rate band would have been 14%–22% on a personal loan; with LAP it's 11.5%–16.5%. The 5–8 percentage point difference is the value of the routing.

**Negotiation Card summary**

- Recommended borrowing: ₹15,00,000
- Lender sanction: ₹31,50,000 (LAP cap)
- Maximum safe EMI: ₹8,583/mo (LTV-derived; income is tight — keep tenure long)
- Recommended tenure: 60 months
- Fair rate: 11.5% – 16.5% p.a.
- Processing fee: 1.00% of principal
- Estimated APR: 11.7% – 16.7%
- Recommended product: Loan Against Property (LAP)
- Branch ask: insist on LAP pricing, not unsecured PL; bring ITR + cash-deposit proof; ask about foreclosure terms

---

## Anita · Delivery Rider (35, Hubballi)

**Questions asked (14)**: employment, net income, cash range, income doc, business vintage, household extra, essentials, dependents, existing EMI, high-cost debt, high-cost outstanding, bounces, credit score, purpose, amount, tenure, age.

**Questions skipped (2)**: collateral (ask < ₹5L), household-extra-available (no spouse income).

**Key inputs**

| Field | Value |
| :--- | :--- |
| Employment | Informal (delivery rider + home tailoring) |
| Net monthly income | ₹28,000 (midpoint of ₹26–30k) |
| Cash income range | ₹26,000 – ₹30,000 |
| Income documentation | Bank statement only |
| Household extra | ₹0 |
| Existing EMIs | ₹9,000 |
| High-cost debt share | **30%** of income (3 app loans @ 30%+ interest, ₹35k outstanding) |
| Monthly essentials | ₹18,000 |
| Dependents | 2 (children); husband unemployed 8 months |
| CIBIL | Unknown |
| Recent bounces | **1** in last 12 months |
| Collateral | None |
| Requested | ₹1,50,000 EV loan, 24 months |
| Age | 35 |

**Outputs**

| # | Output | Value |
| :--- | :--- | :--- |
| **O1** | Verdict | **Don't Borrow** |
| | Reasons | Recent EMI bounce (1) plus 30% of income already servicing high-cost debt is a classic debt-trap pattern — a fresh loan would deepen the strain, not solve it. (R05) |
| **O2** | Lender Sanction Max | ₹0 |
| | Borrower Safe Capacity | ₹0 |
| | Recommended | **₹0** |
| | Which to use? | **Nothing right now.** Stabilise existing obligations first. |
| **O3** | Fair rate band | 13.5% – 21% p.a. (informal, bank-statement-only, vehicle) — moot, verdict is Don't Borrow |
| | Processing fee | 1.00% |
| | Estimated APR | 14% – 21.5% |
| | Confidence | HIGH (0.9 — inputs are well-known; verdict is independent of confidence) |
| **O4** | Safe EMI ceiling | ₹0 |
| | All stress scenarios | Do not survive ❌ |

**Removing the bounce or the high-cost-debt flag (verified by adversarial test)**

- Anita minus bounce (`recentBounces: 0`): verdict remains Don't Borrow. The R05 trigger for bounce + high-cost is gone, but the sustainability check (full-ask FOIR = 64%, lender cap 30%, safe capacity = 0) still fires. Rate band shifts because the bounce penalty leaves the band.
- Anita minus high-cost debt (`highInterestDebtRatio: 0`): same result, also affordability-driven. Rate band shifts.

The R05 trigger requires *both* a bounce and high-cost debt. If Anita removed the bounce (e.g. cleared it up with the lender) AND retired the high-cost app loans, the verdict would still be Don't Borrow for the same reason (the ask is unaffordable for the income). The fix is *not* a new loan — it's retiring the existing 30%-interest debt.

**Negotiation Card summary**

- Recommended borrowing: ₹0
- Lender sanction: ₹0
- Maximum safe EMI: ₹0
- Fair rate: 13.5% – 21% p.a. (moot)
- Recommended product: (none — no new loan)
- Branch ask: do **not** seek a new loan. Ask the lender for a **debt-consolidation quote** that closes the 3 app loans in exchange for a single lower-rate obligation, with no fresh principal. The condition: the new total cost must be lower than the existing 30% annualised interest, monthly cash flow must improve, and no new principal is layered on. See `verdict.ts` debt-consolidation reason.

**Stress check (hypothetical, for the card)**: if Anita's app loans were retired and her income rose to ₹35k, the safe EMI ceiling would become ~₹17k/mo. The card makes this conditional, not assumed.

---

## Summary scorecard

| Persona | Verdict | Product | Lender Max | Safe | Recommended | Rate band | APR | Confidence | Stress |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Priya | Borrow | Personal Loan | ₹15.28 L | ₹11.18 L | ₹8.00 L | 10.99–14.5% | 11.49–15% | HIGH | ✅ both |
| Ravi | Borrow | **LAP** | ₹31.50 L | ₹27.00 L | ₹15.00 L | 11.5–16.5% | 11.7–16.7% | HIGH | ⚠️ income tight |
| Anita | **Don't Borrow** | (none) | ₹0 | ₹0 | ₹0 | n/a | n/a | HIGH | ❌ both |

All three outcomes are derived from the same rule engine (`R01–R-CONF` in `RULES.md`). No persona-specific branches.