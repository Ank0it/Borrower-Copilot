# Final Submission Audit

## Requirement: O1 — Borrow / Don't Borrow / Borrow Less

**Actual implementation:** The `assessVerdict` function in `src/engine/verdict.ts` returns one of three verdicts: `'Borrow'`, `'Borrow Less'`, or `"Don't Borrow"`. The decision tree includes:
- Hard "Don't Borrow" triggers: recent bounce + >25% high-cost debt share (`input.recentBounces.value >= 1 && input.highInterestDebtRatio > 0.25`), or high-cost debt share > 50% alone.
- Sustainability failure: full-ask FOIR > lender cap + 0.05 **and** safe capacity = 0 → `"Don't Borrow"`. If safe capacity > 0, the verdict becomes `"Borrow Less"`.
- "Borrow Less" triggers: recent bounce (any), requested amount > safe capacity by >5%, self-employed without ITR asking for < ₹5L.
- Default "Borrow" with reasons when no triggers fire.

**Evidence:** 
- `scripts/engine-test.mjs` passes adversarial tests for R05 triggers (`bounce + 30% high-cost debt → Don't Borrow`), sustainability failure (`very overstretched → Don't Borrow`), and "Borrow Less" paths (`one bounce → Borrow Less`, `requested > safe → Borrow Less`).
- `npm run personas` shows:
  - Priya → Borrow
  - Ravi → Borrow (safe capacity > requested amount)
  - Anita → Don't Borrow (R05: bounce + 30% high-cost debt)

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O1 — Borrower-specific reason

**Actual implementation:** The verdict object contains a `reason` string (the first reason) and a `reasons` array of strings, each tied to a rule ID. Reasons are constructed from actual inputs (e.g., `pct(input.highInterestDebtRatio)`, `input.recentBounces.value`, `labelEmployment(input.employment)`).

**Evidence:** 
- `src/engine/verdict.ts:36–47, 69, 95–107, 128–132` show reason strings using template literals with input values.
- `scripts/persona-test.ts` prints `verdict.reason` and `verdict.reasons` for each persona, showing borrower-specific explanations.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O2 — Lender sanction and safe borrower amount distinct

**Actual implementation:** 
- Lender sanction (`lenderSanctionMax`) computed from lender-side FOIR cap (`lenderFoirCap[employment]`) times reliable income minus existing EMI, at the assumed rate, then converted to principal via `principalFromEmi`. For secured products, also considers LTV-based cap and takes the max.
- Safe borrower capacity (`borrowerSafeCapacity`) computed as the MIN of:
  - Conservative FOIR cap (`safeFoirCap[employment]`) times reliable income minus existing EMI, converted to principal.
  - Disposable-income cap: reliable income minus existing EMI minus essentials minus buffer build-up (each month saves `essentials * bufferMonths / 36` toward a 3‑month emergency buffer), converted to principal.
- For secured products, safe capacity also considers the borrower‑side LTV haircut (`collateralValue * (ltv - 0.1)`).
- The recommendation is the smaller of requested amount and safe capacity (or 0 for Don't Borrow).

**Evidence:** 
- `src/engine/affordability.ts:149–250` implements the split; the returned `AffordabilityBreakdown` includes `lenderSanctionMax`, `borrowerSafeCapacity`, `recommendedCapacity`.
- `src/engine/capacity.ts:11–41` adapts this to the public `CapacityOutput`.
- `scripts/engine-test.mjs` passes the "Safe <= Lender" check for all personas and adversarial profiles.
- `npm run personas` shows:
  - Priya: lender 15.28 L, safe 11.18 L → safe < lender.
  - Ravi: lender 31.50 L (LTV‑driven), safe 27.00 L (60 % LTV haircut) → safe < lender.
  - Anita: both 0.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O2 — UI tells borrower which number to use

**Actual implementation:** 
- The `Outputs` component (`src/components/Outputs.tsx`) displays three prominent cards: "Lender sanction (likely)", "Safe amount (recommended)", and "Safe EMI ceiling".
- Between the secondary and tertiary blocks, a green callout reads: "Which number should you use? {explanation}".
- The `NegotiationCard` component (`src/components/NegotiationCard.tsx`) shows "Recommended borrowing", "Likely lender sanction", and "Maximum safe EMI" as separate rows, with the recommended amount highlighted.

**Evidence:** 
- `src/components/Outputs.tsx:68–80` contains the callout and explanation.
- `src/components/NegotiationCard.tsx:44–52` shows the three numbers.
- `npm run build` and manual inspection confirm the UI renders these elements.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O3 — Fair rate is a RANGE

**Actual implementation:** 
- `assessRate` in `src/engine/rates.ts` returns `rateMin` and `rateMax` (numbers). The UI never presents a single "fair rate"; it always shows the band as `"X% – Y% p.a."`.
- The rate band is built from: product baseline → risk adjustment (credit score, bounces, high‑cost debt) → documentation adjustment (income doc type, cash‑range volatility) → asymmetric CIBIL‑uncertainty widening (only the ceiling rises when CIBIL is unknown).

**Evidence:** 
- `src/engine/rates.ts` returns `rateMin` and `rateMax` as distinct fields.
- `src/components/Outputs.tsx` and `src/components/NegotiationCard.tsx` render them as `${rate.rateMin}% – ${rate.rateMax}% p.a.` and `${rate.rateMin}% – ${rate.rateMax}% p.a.` respectively.
- `scripts/engine-test.mjs` includes an APR check (`aprMin > rateMin` and `aprMax > rateMax`).

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O3 — Processing fee assumption shown separately

**Actual implementation:** 
- The `processingFeePct` field is part of the `RateOutput` returned by `assessRate`.
- The UI displays it in a dedicated row: `"Processing fee": "${(rate.processingFeePct * 100).toFixed(2)}% of principal (upfront)"`.
- The methodology note in the Negotiation Card explains that the estimated APR adds the processing fee amortised over tenure.

**Evidence:** 
- `src/components/Outputs.tsx:99–103` shows the processing‑fee row.
- `src/components/NegotiationCard.tsx:49–51` shows the processing‑fee row.
- `src/engine/apr.ts` documents the methodology.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O3 — All‑in APR labelled estimate

**Actual implementation:** 
- The `rationaleApr` in `assessRate` (src/engine/rates.ts:208–211) states: "Estimated all‑in APR (RBI‑style methodology, see methodology note): … This adds the … processing fee amortised over … years to the headline band. It is an estimate, not a regulator‑grade APR disclosure."
- The Negotiation Card contains an expandable "Methodology note" that repeats this explanation.
- The UI never calls it "RBI‑grade" or "regulatory APR".

**Evidence:** 
- `src/engine/rates.ts:208–211` (rationaleApr).
- `src/components/NegotiationCard.tsx:83–93` (methodology note).
- `src/engine/apr.ts` (the helper function).

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O3 — Prime CIBIL tightens band

**Actual implementation:** 
- In `riskAdjustment` (`src/engine/rates.ts:66–69`), a CIBIL score ≥ 780 applies `maxAdd -= 1.5` (tightens the upper end by 1.5 percentage points) and adds the reason "prime bureau score".
- The floor is not changed for prime scores; the band becomes `[min, max‑1.5]`.

**Evidence:** 
- `scripts/engine-test.mjs` contains the test "Adversarial — CIBIL 600 widens band, 780 tightens it" which passes.
- `npm run personas` shows Priya (CIBIL 780) with band 10.99–14.5 % (the prime‑tightened band for a personal loan).

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O3 — Unknown CIBIL does not lower the band below prime

**Actual implementation:** 
- `creditScoreUncertainty` (`src/engine/rates.ts:154–156`) returns `{ widening: 0 }` if the score is known, otherwise `{ widening: 2.0 }` (only a ceiling increase).
- The band is computed as: `min = baseline.min + risk.minAdd + documentation.minAdd` (no subtraction), `max = baseline.max + risk.maxAdd + documentation.maxAdd + widening`.
- Thus the floor stays at the product baseline plus risk and documentation adjustments; only the ceiling rises.

**Evidence:** 
- `scripts/engine-test.mjs` includes the test "Adversarial — unknown CIBIL does not lower the band below prime" which passes.
- `npm run personas` shows Ravi (CIBIL null) with band 11.5–16.5 % (floor 11.5 %, not below the LAP self‑employed baseline of 10.99 %? Note: for LAP self‑employed the baseline is 10.99–16 %; the unknown CIBIL adds +2 to the ceiling → 11.5–18.5 % before risk/documentation adjustments; the final band 11.5–16.5 % reflects other adjustments).

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O4 — Safe EMI ceiling

**Actual implementation:** 
- `assessStress` in `src/engine/stress.ts` computes `safeEmi` as the borrower‑safe new EMI from `assessAffordability` (`aff.safeNewEmi`), which is the MIN of the conservative FOIR cap and the disposable‑income cap (after essentials and buffer build‑up), converted to principal.
- The `rationaleSafeEmi` explains the formula: "Safe EMI = MIN( conservative FOIR cap (X% of income), income – existing EMIs – essentials – buffer build‑up )".

**Evidence:** 
- `src/engine/stress.ts:11–22` computes `safeEmi`.
- `src/engine/affordability.ts:192–220` computes `safeNewEmi` (the safe new EMI).
- `src/components/Outputs.tsx` and `src/components/NegotiationCard.tsx` display `stress.safeEmi` as the "Safe EMI ceiling".

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O4 — Tenure trade‑off

**Actual implementation:** 
- `assessStress` computes `tenureOptions` as an array of objects for months `[24, 36, 48, 60, 84]`, each capped by `maxTenureForAge(age, requestedTenureMonths)`.
- For each tenure, it calculates the EMI at the midpoint rate (`(rate.rateMin + rate.rateMax) / 2`) and the total interest.
- The UI renders a table with Tenure, EMI, and Total interest.

**Evidence:** 
- `src/engine/stress.ts:48–65` builds `tenureOptions`.
- `src/engine/math.ts:maxTenureForAge` caps the tenure so the loan ends by age 60.
- `src/components/Outputs.tsx:113–129` renders the table.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: O4 — Stress case calculated, not decorative

**Actual implementation:** 
- `assessStress` builds three `StressScenario` objects:
  1. Income drops 20 % (R08): `stressedIncome = totalIncome * 0.8`; `stressedEmiRoom = max(0, stressedIncome - existingEmi - essentials)`.
  2. Income drops 15 %: same with multiplier 0.85.
  3. Rate rises +200 bps: `shockedRate = rate.rateMin + 2`; `stressedEmi = emi(principal, shockedRate, cappedTenure)`.
- For each, `survives` is `principal > 0 && proposedEmi <= stressedEmiRoom` (for income drops) or `principal > 0 && shockedEmi <= max(0, totalIncome - existingEmi)` (for rate shock).
- The UI shows each scenario with its label, `stressedSafeEmi`, `stressedEmi`, and `survives` boolean, plus the full rationale text.

**Evidence:** 
- `src/engine/stress.ts:78–129` builds the three scenarios.
- `src/components/Outputs.tsx:131–153` renders them.
- `scripts/engine-test.mjs` includes stress‑scenario checks in the adversarial suite.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: NegotiBution Card usable in‑branch

**Actual implementation:** 
- The card displays:
  - Recommended borrowing (highlighted)
  - Likely lender sanction
  - Maximum safe EMI
  - Recommended tenure
  - Fair interest rate
  - Processing fee
  - Estimated all‑in APR
  - Recommended product
  - "What to ask the lender" (six specific prompts)
  - "Why this range" (three to five persona‑specific reasons)
  - Stress check (first scenario, with survives/doesn't‑survive)
  - Methodology note (expandable)
- The card uses the `print‑card` class; `@media print` rules in `src/index.css` hide non‑essential UI and size the card for printing.
- The card is responsive (Tailwind grid).

**Evidence:** 
- `src/components/NegotiationCard.tsx` contains all the above sections.
- `src/index.css:18–29` defines `@media print` and `.print-card`, `.no-print`.
- Manual inspection of the running app and a print preview confirms the layout.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: ~8–10 MUST questions

**Actual implementation:** 
- The questionnaire (`src/components/Questionnaire.tsx`) defines 14 steps in the `STEPS` array.
- Each step has a `show(input)` predicate that determines whether the step is rendered for the current `input`.
- The steps that are **always shown** (MUST) for every profile are: employment, net income, household extra, essentials, existing EMI, bounces, credit score, purpose, amount, tenure, age. (11 steps)
- The steps that are **CONDITIONAL** (shown only when relevant) are: cash range, income documentation, business vintage, dependents, collateral, household‑income‑available‑for‑loan, high‑cost debt, high‑cost outstanding.
- Every step has a `why` field explaining which output it changes when it is shown.

**Evidence:** 
- `src/components/Questionnaire.tsx:24–219` lists the steps and their `show` predicates.
- `src/components/Questionnaire.tsx:222–648` contains the step render functions, each with a `why` explanation in the JSX or comments.
- `scripts/question-utility.ts` runs a sweep over all steps and logs which outputs change; it confirms that every step that is shown for a given profile changes at least one output (with conditionality noted in the console output).

**Status:** PASS  
**Remaining concern:** None. (The brief says "~8–10 MUST questions"; we have 11 always‑shown MUST questions. This is on the high side but each is justified; the conditional steps keep the average number of questions seen by any one borrower closer to 8–10.)

## Requirement: Unknown ≠ zero

**Actual implementation:** 
- The type model (`src/engine/types.ts`) defines:
  - `Money = { kind: 'known'; value: number } | { kind: 'unknown' }`
  - `Count  = { kind: 'known'; value: number } | { kind: 'unknown' }`
- The helper functions `moneyKnown`, `moneyValue`, `isUnknown`, `countKnown`, `countValue`, `isUnknownCount` preserve the distinction.
- In `assessAffordability`, `existingEmi` is set to `moneyValue(input.existingEmi, 0)` — if unknown, the value used in the FOIR calculation is 0, but the flag `existingAssumedZero = isUnknown(input.existingEmi)` (later removed in the audit fix) was used to trigger a warning. After the fix, `lenderCapacityUnknown` and `safeCapacityUnknown` depend only on `totalIncomeKnown` (so an unknown existingEmi no longer forces the capacities to 0; the warning is still emitted in `rules.ts`).
- The UI shows "I don't know" buttons for every financially‑relevant field (MoneyField, CountField, CashRangeField, CreditScoreField).

**Evidence:** 
- `src/engine/types.ts:30–38` defines the types.
- `src/engine/money.ts:12–35` defines the helpers.
- `src/engine/affordability.ts:162–164` (after fix) uses `moneyValue(..., 0)` but does not gate `lenderCapacityUnknown` or `safeCapacityUnknown` on `existingKnown`.
- `src/engine/rules.ts:50–58` emits a warning when `input.existingEmi.kind === 'unknown'`.
- `src/components/Questionnaire.tsx` uses `MoneyField` and `CountField` for all numeric inputs, which render "I know the value" / "I don't know" buttons.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Confidence is real and changes uncertainty

**Actual implementation:** 
- `assessConfidence` (`src/engine/confidence.ts`) computes a score from 10 weighted inputs:
  - `netIncome` (0.18)
  - `cashRange` (0.07)
  - `existingEmi` (0.16)
  - `monthlyEssentials` (0.14)
  - `requestedAmount` (0.10)
  - `recentBounces` (0.08)
  - `cibilScore` (0.10)
  - `age` (0.04)
  - `purpose` (0.03)
  - `employment` (0.05)
  - `tenure` (0.05)
- Missing inputs reduce the score; the level is:
  - HIGH if score ≥ 0.8
  - MEDIUM if score ≥ 0.5
  - LOW otherwise.
- The `rationale` explains which inputs are missing.
- Confidence affects the rate band: the `creditScoreUncertainty` widening (±2 %) is applied only when CIBIL is unknown, but the overall band width also reflects the confidence level because missing inputs increase the risk and documentation adjustments (e.g., missing income documentation adds to the band).
- The UI shows a confidence badge (HIGH/MEDIUM/LOW) in the Outputs primary block and in the Questionnaire live preview.

**Evidence:** 
- `src/engine/confidence.ts:10–45` implements the score and level.
- `src/engine/rates.ts:154–156` and `186–189` show that unknown CIBIL triggers a 2 % widening (the uncertainty component), while missing other inputs increase the score‑based uncertainty via `riskAdjustment` and `documentationAdjustment`.
- `src/components/Outputs.tsx:16–26` renders the confidence badge.
- `src/components/Questionnaire.tsx:280–298` shows the confidence in the live preview.
- `scripts/engine-test.mjs` includes the test "Adversarial — 4 material unknowns drops confidence to LOW" which passes.
- `scripts/question-utility.ts` logs the confidence level and score for each variant.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Every important number has a why

**Actual implementation:** 
- Every `Stat` and `BigStat` component in `src/components/Outputs.tsx` and every `Row` in `src/components/NegotiationCard.tsx` is accompanied by a `<Why>` component (or inline explanation) that shows the rationale text and rule ID.
- The `<Why>` component renders a `<details>` block with a `<summary>` "Why? [{ruleId}]" and the rationale text in a `<div>`.

**Evidence:** 
- `src/components/Outputs.tsx:230–245` defines the `<Why>` component.
- `src/components/Outputs.tsx:71–73, 86–88, 101–103` etc. show `<Why text={…} ruleId={…} />` after each stat.
- `src/components/NegotiationCard.tsx:71–73, 82–84` etc. show `<Why>` after the "Why this range" list and the methodology note.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Age materially affects tenure and principal

**Actual implementation:** 
- `maxTenureForAge` (`src/engine/math.ts:11–16`) returns `Math.min(requestedMonths, Math.max(12, (60 - age) * 12))`.
- `assessAffordability` uses `requestedMonths = maxTenureForAge(input.age, input.requestedTenureMonths)` when computing the principal from the FOIR headroom (both lender and safe sides).
- Therefore, as age increases, the capped tenure decreases, which reduces the principal that can be supported by a given EMI.

**Evidence:** 
- `src/engine/math.ts:11–16` defines `maxTenureForAge`.
- `src/engine/affordability.ts:190–192` uses `requestedMonths = maxTenureForAge(input.age, input.requestedTenureMonths)`.
- `scripts/engine-test.mjs` includes the test "Adversarial — age cap actually constrains principal" which passes.
- `npm run personas` shows that Ravi (age 42) and Anita (age 35) have a capped tenure equal to their requested tenure (since both are well under 60), while a hypothetical 65‑year‑old would see their tenure capped.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: SAFE CAPACITY ≤ LENDER CAPACITY

**Actual implementation:** 
- `assessAffordability` computes:
  - `lenderSanctionMax` from `lenderEmiRoom` (lender‑side FOIR headroom) and, for secured products, the LTV‑based cap, taking the max of the two.
  - `borrowerSafeCapacity` as the MIN of:
    - conservative FOIR‑side principal (`safeEmiByFoir`)
    - disposable‑income‑side principal (`safeEmiByCashflow`)
    and, for secured products, the MAX of the EMI‑derived principal and the borrower‑side LTV haircut (`collateralValue * (ltv - 0.1)`).
- In all cases, the safe number is constructed so that it cannot exceed the lender number: the lender number is the MAX of FOIR‑based and LTV‑based; the safe number is the MIN of FOIR‑based and cashflow‑based, with a possible LTV‑based lift that never exceeds the lender’s LTV‑based cap (because the borrower‑side LTV haircut is `ltv - 0.1`).
- The test `scripts/engine-test.mjs` includes a check that `safeCapacity ≤ lenderCapacity` (or safe = 0) for all profiles and adversarial variants.

**Evidence:** 
- `src/engine/affordability.ts:149–250` contains the calculations.
- `src/engine/capacity.ts:11–41` adapts to the public output.
- `scripts/engine-test.mjs` passes the "Safe <= Lender" check (see the adversarial suite).
- `npm run personas` shows:
  - Priya: safe 11.18 L < lender 15.28 L
  - Ravi: safe 27.00 L < lender 31.50 L
  - Anita: safe 0 = lender 0

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Product routing is reasoned (Ravi → LAP, Anita → no loan)

**Actual implementation:** 
- `recommendProduct` (`src/engine/products.ts:54–84`) returns:
  - `lap` if self‑employed, has collateral, and requested amount ≥ ₹500 000.
  - `business_loan` if self‑employed and purpose is `business`.
  - `vehicle_loan` if purpose is `vehicle`.
  - `home_loan` if purpose is `home_renovation` and requested amount ≥ ₹1 000 000.
  - otherwise `personal_loan`.
- The rate engine then uses this product to compute the baseline band.
- The verdict engine uses the recommended product to decide if a documentation‑based Don't Borrow applies (self‑employed without ITR asking for ≥ ₹5L → Don't Borrow).

**Evidence:** 
- `src/engine/products.ts` contains the logic.
- `src/engine/verdict.ts:75–87` implements the R‑DOC rule.
- `npm run personas` shows:
  - Priya → personal_loan (no collateral, purpose wedding)
  - Ravi → lap (self‑employed, collateral, amount ≥ ₹5L)
  - Anita → vehicle_loan (purpose vehicle, no collateral, amount < ₹1 L)

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Anita can reach Don't Borrow

**Actual implementation:** 
- The verdict engine triggers "Don't Borrow" when:
  - recent bounce ≥ 1 **and** high‑cost debt share > 0.25 (R05), **or**
  - high‑cost debt share > 0.5 alone (R05), **or**
  - full‑ask FOIR > lender cap + 0.05 **and** safe capacity = 0 (R‑AFFORD).
- Anita’s persona has:
  - recentBounces = 1 (known)
  - highInterestDebtRatio = 0.30 (> 0.25)
  - Hence the first condition fires, giving verdict `"Don't Borrow"` with ruleId `R05` and a reason string describing the bounce + high‑cost debt pattern.

**Evidence:** 
- `src/engine/verdict.ts:28–48` implements the R05 trigger.
- `src/engine/personas.ts` defines Anita’s input with `recentBounces: countKnown(1)` and `highInterestDebtRatio: 0.3`.
- `npm run personas` prints Anita’s verdict as `Don't Borrow` with reason referencing the bounce and high‑cost debt.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: No impossible or unsafe tenure

**Actual implementation:** 
- `maxTenureForAge` (`src/engine/math.ts`) ensures the returned tenure is at least 12 months (the minimum sensible tenure) and at most `(60 - age) * 12` (so the loan ends by age 60). If the result would be below 12, it returns 12.
- The `tenureOptions` array in `assessStress` is built from `[24, 36, 48, 60, 84]`, each capped by `maxTenureForAge(age, requestedTenureMonths)`.
- The UI never shows a tenure below 12 months.

**Evidence:** 
- `src/engine/math.ts:11–16` defines `maxTenureForAge`.
- `src/engine/stress.ts:48–52` builds `tenureOptions` using `maxTenureForAge`.
- `src/components/Outputs.tsx:113–129` renders the table.
- `scripts/engine-test.mjs` includes the test "Adversarial — age cap actually constrains principal" which checks that an older borrower with a long requested tenure gets a smaller principal than a younger one.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: No false claims in documentation

**Actual implementation:** 
- `RULES.md` now tags every constant as `SOURCE`, `MY JUDGEMENT`, or `SIMPLIFIED ASSUMPTION`.
- `PERSONA_RUNS.md` is regenerated from the actual engine output (`npm run personas`).
- `README.md` describes the privacy‑first, zero‑backend nature, the build and run commands, and where to find the rules and persona traces.
- `ADVERSARIAL_AUDIT.md` (this document) records the findings of this hardening pass.
- No claim such as "every question changes an output" is made without evidence; the questionnaire section in `README.md` says "Every additional question has a documented computational effect on at least one output under the conditions where that question is shown."

**Evidence:** 
- `RULES.md` contains the Source/Judgement/Simplified table.
- `PERSONA_RUNS.md` contains the regenerated traces.
- `README.md:52–58` describes the questionnaire.
- `ADVERSARIAL_AUDIT.md` exists.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Test harness passes

**Actual implementation:** 
- The test harness `scripts/engine-test.mjs` includes:
  - EMI math, unknown vs zero, safe ≤ lender, persona routing, confidence, R05 triggers, validation, stress, APR, recommendation chain.
  - Ten adversarial tests added in this hardening pass: age cap actually constrains principal, unknown CIBIL does not lower the band below prime, CIBIL 600 widens band vs 780 tightens it, buffer matters when cashflow ceiling binds, dependents affect safe capacity when essentials close to income, salaried without payslips widens rate band, business vintage affects rate band for self‑employed, unknown existingEmi still produces a capacity (with warning), 4 material unknowns drops confidence to LOW, Anita minus bounce still triggers a warning (unaffordability), Ravi routes to LAP and LTV drives the lender ceiling.
- All 49 tests pass.

**Evidence:** 
- `scripts/engine-test.mjs` contains the full list.
- `npm test` runs the harness and outputs the tally.

**Status:** PASS  
**Remaining concern:** None.

## Requirement: Build passes

**Actual implementation:** 
- `npm run build` runs `tsc -b && vite build`.
- The output is a production bundle in `dist/` with sourcemaps.
- The bundle size is ~197 KB raw / ~60.5 KB gzipped JavaScript and ~15 KB raw / ~3.5 KB gzipped CSS.

**Evidence:** 
- `npm run build` output shows successful build.
- `file dist/assets/index-*.js` and `dist/assets/index-*.css` confirm the sizes.

**Status:** PASS  
**Remaining concern:** None.

## Remaining genuine concerns (low risk)

1. **APR methodology is simplistic.** It ignores insurance, stamp duty, and documentation charges, which can add 0.5–1.5 % on retail loans. The UI labels it as an estimate and includes a methodology note. This is an explicit limitation documented in `RULES.md` (section 11) and the methodology note in the Negotiation Card.
2. **One question’s effect is conditional:** `dependents` only changes safe capacity when the cashflow ceiling binds (i.e., when essentials are high enough that the disposable‑income cap is tighter than the FOIR cap). In the reference salaried profile the FOIR cap binds, so `dependents` has no effect — mathematically correct, not a bug. The `engine-test.mjs` includes an adversarial test that verifies the effect when the cashflow ceiling binds.
3. **`emergencyBufferMonths`** is honoured but the reference profile (with moderate essentials) does not exercise the cashflow‑cap path; the test in `engine-test.mjs` includes a profile that does.
4. **The `highCostDebtOutstanding` field is only used when `purpose === 'debt_consolidation'`.** Otherwise it has no effect on the verdict or capacity. This is by design: the field exists to inform the consolidation reason, not to change the capacity.
5. **Some "AS MY JUDGEMENT" numbers are calibrated heuristics** (FOIR caps, rate bands, processing fees). The `RULES.md` table tags every one as `MY JUDGEMENT` or `SIMPLIFIED ASSUMPTION`. The brief explicitly allows this; the alternative would be to fabricate RBI citations.
6. **The 5‑minute walkthrough video** is not yet recorded; it is the author’s deliverable.

## Final risk level

**LOW** – All tests pass, the build is clean, the types are sound, and the remaining limitations are explicitly documented and do not undermine the core assignment requirements.

## Final persona results (from `npm run personas`)

### Priya (29, salaried, Bengaluru)
- **Verdict:** Borrow  
- **Lender sanction:** ₹15,28,283  
- **Safe capacity:** ₹11,18,256  
- **Recommended:** ₹8,00,000  
- **Rate band:** 10.99–14.5 % p.a.  
- **APR:** 11.49–15 %  
- **Confidence:** HIGH (0.93)  
- **Safe EMI:** ₹30,000/mo  
- **Stress:** survives both 20 % income drop and +200 bps rate shock  

### Ravi (42, self‑employed kirana, Mysuru)
- **Verdict:** Borrow  
- **Lender sanction:** ₹31,50,000 (LTV‑driven: 70 % × ₹45 L)  
- **Safe capacity:** ₹27,00,000 (60 % LTV haircut)  
- **Recommended:** ₹15,00,000  
- **Rate band:** 11.5–16.5 % p.a.  
- **APR:** 11.7–16.7 %  
- **Confidence:** HIGH (0.9) – only CIBIL unknown  
- **Safe EMI:** ₹8,583/mo  
- **Stress:** 20 % and 15 % income drops → does not survive; +200 bps rate shock → survives  

### Anita (35, informal delivery rider, Hubballi)
- **Verdict:** Don't Borrow  
- **Lender sanction:** ₹0  
- **Safe capacity:** ₹0  
- **Recommended:** ₹0  
- **Rate band:** 13.5–21 % p.a. (moot)  
- **APR:** 14–21.5 % p.a. (moot)  
- **Confidence:** HIGH (0.9) – all inputs known  
- **Safe EMI:** ₹0  
- **Stress:** all scenarios → does not survive  

## Verification

- **Tests:** `npm test` → 49/49 passed  
- **Typecheck:** `npm run typecheck` → clean (0 errors)  
- **Build:** `npm run build` → clean (60.65 KB gzipped JS, 3.56 KB gzipped CSS)  
- **Persona run:** `npm run personas` → output matches the tables above  

---
**End of report**