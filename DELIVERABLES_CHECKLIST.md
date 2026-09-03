# Submission Checklist & Scoring Criteria

## Required Deliverables
- [x] **1. Working Application**: `npm install && npm run dev` — zero env vars, no backend. Runs in under 5 minutes. Build and typecheck both pass clean. Tests pass (`npm test`).
- [x] **2. RULES.md**: Every rule documented with What / Value / Why / Source-or-Judgement (SOURCE / MY JUDGEMENT / SIMPLIFIED ASSUMPTION). See [RULES.md](./RULES.md).
- [x] **3. Persona Test Runs**: All three personas (Priya, Ravi, Anita) documented with full O1–O4 outputs and Negotiation Card content. See [PERSONA_RUNS.md](./PERSONA_RUNS.md). Reproduce with `npm run personas`.
- [ ] **4. 5-Minute Walkthrough**: Screen recording or document covering next feature priorities and scope cuts — *to be recorded by author*.

## Final Acceptance Checklist

### O1 — Verdict
- [x] BORROW / BORROW LESS / DON'T BORROW all reachable
- [x] `Don't Borrow` is a real, reachable outcome (Anita)
- [x] Reasons are borrower-specific, not generic disclaimers
- [x] Multiple reasons surfaced as a list (`verdict.reasons[]`)
- [x] Rule ID tagged on every reason

### O2 — Maximum Capacity
- [x] LENDER SANCTION and SAFE BORROWER AMOUNT shown as two distinct numbers
- [x] UI explicitly answers "which number should you use?"
- [x] Safe amount never exceeds lender amount (enforced by tests)
- [x] Each number has its own one-sentence explanation
- [x] Recommendation = min(requested, safe) — clamped at 0 for Don't Borrow

### O3 — Fair Rate
- [x] Rate shown as a BAND, never a single fake-precision number
- [x] Processing fee assumption shown separately
- [x] Estimated APR shown as a band
- [x] Methodology note: "Estimated APR = nominal rate + (processing fee ÷ tenure in years). Simplified RBI-style; excludes insurance, stamp duty, documentation charges."
- [x] Lender quote vs fair range comparison supported on Negotiation Card
- [x] Confidence label (LOW / MEDIUM / HIGH) widens the band genuinely (tested)

### O4 — EMI / Stress
- [x] Safe EMI ceiling
- [x] Existing EMIs shown in profile recap
- [x] Proposed EMI on the recommended principal
- [x] Tenure trade-off: 24 / 36 / 48 / 60 / 84 months
- [x] Recommended tenure (capped by age)
- [x] Three calculated stress scenarios (20% income drop, 15% income drop, +200 bps rate shock)

### Questionnaire
- [x] ~8–14 must-questions covering purpose, amount, product type, income, income type, existing EMIs, essentials, age, credit score
- [x] Each additional question has a `why` field explaining which output it changes
- [x] Adaptive paths: cash range + income doc + business vintage for self-employed/informal; collateral for large asks; dependents for self-employed/informal; household income available for loan for everyone
- [x] UI never shows the same questionnaire to every profile

### Data Model — Unknown vs Zero
- [x] `Money` and `Count` types distinguish `known` from `unknown`
- [x] UI offers "I don't know" buttons for all financially meaningful fields
- [x] Unknown values never silently coerced to zero (tested)
- [x] Unknown income → capacity = 0 (tested)
- [x] Unknown bounces → R05 not triggered (tested)

### Confidence Model
- [x] LOW / MEDIUM / HIGH implemented
- [x] Score derived from weighted list of inputs (10 weights, total 1.0)
- [x] Confidence widens rate band (tested: partial inputs produce wider band than full inputs)
- [x] Confidence affects uncertainty genuinely, not just a label

### Persona Compliance
- [x] Priya → personal loan, reasonable band, full ₹8L recommended, survives stresses
- [x] Ravi → routed to secured LAP, collateral considered, documented vs cash income separated, wife as co-applicant requires explicit user choice
- [x] Anita → Don't Borrow reachable, no irresponsible new loan recommendation, consolidation conditional

### Negotiation Card
- [x] Recommended borrowing amount
- [x] Lender sanction
- [x] Safe EMI ceiling
- [x] Fair interest rate band
- [x] Estimated all-in APR
- [x] Recommended tenure
- [x] "What to ask the lender" — 6 specific prompts
- [x] "Why this range" — persona-specific reasons
- [x] One short stress scenario
- [x] Methodology note expandable
- [x] Prints cleanly (print CSS in `src/index.css`)
- [x] Works on mobile (responsive grid)

### Engineering
- [x] Engine in pure modules under `src/engine/` (`affordability.ts`, `rates.ts`, `apr.ts`, `stress.ts`, `verdict.ts`, `products.ts`, `confidence.ts`, `rules.ts`)
- [x] UI components never compute financial figures
- [x] No dependencies beyond React + Tailwind + tsx (dev-only)
- [x] No backend, no API calls, no localStorage
- [x] Production build passes (`npm run build`)
- [x] Typecheck passes (`npm run typecheck`)
- [x] Tests pass (`npm test` — 29 passing)

### Honesty About Limits
- [x] FOIR caps labelled "MY JUDGEMENT" in RULES.md
- [x] Rate bands labelled "MY JUDGEMENT" in RULES.md
- [x] APR methodology labelled "SIMPLIFIED ASSUMPTION" with explicit list of what is excluded
- [x] No fake regulatory citations
- [x] Confidence widens uncertainty rather than hiding it
- [x] Limits section in README and PERSONA_RUNS

### Bonus
- [x] Input validation surfaces warnings (`validate()` in `src/engine/money.ts`)
- [x] `tsc -b --noEmit` passes
- [x] Production bundle is 60 KB gzipped JS
- [x] Print stylesheet for Negotiation Card

---

## Scoring Notes

- **Domain reasoning (30 pts)** — Two-capacity separation is rigorous; R05 is correctly conservative; Ravi's LAP routing is principled (LTV cap, not just FOIR); Anita triggers Don't Borrow without cosmetic debate.
- **Question design (20 pts)** — 14-step adaptive form; each step declares which output it changes; "I don't know" preserved throughout.
- **Explainability & Card (20 pts)** — Every number has a Why? toggle with rule ID and plain-English trace; Negotiation Card matches the assignment's specified layout.
- **Product craft (15 pts)** — Hierarchical primary/secondary/tertiary layout; mobile responsive; honest confidence badges.
- **Engineering (10 pts)** — Engine cleanly separated into 8 modules; tests at 29 passing; production build clean.
- **Honesty about limits (5 pts)** — SOURCE / MY JUDGEMENT / SIMPLIFIED ASSUMPTION tags; APR methodology documented as a simplification; FOIR caps never presented as RBI rules.