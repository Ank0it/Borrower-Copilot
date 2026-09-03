# Borrower Copilot

Privacy-first, **zero-backend**, client-side loan self-assessment for Indian borrowers. Runs entirely in the browser — no API calls, no bureau pulls, no storage.

## Quick start (under 5 minutes)

Requirements: **Node.js ≥ 20** (Vite 5 requires Node 20+).

```bash
npm install
npm run dev
```

Open the URL printed in the terminal (default: http://localhost:5173). No environment variables required.

## Other commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and produce a production bundle in `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm run typecheck` | Run `tsc -b --noEmit` |
| `npm test` | Run the rule-engine test harness |
| `npm run personas` | Run all three personas through the engine and dump the O1–O4 outputs |

## What it does

Walks a borrower through 8–14 adaptive questions, then renders:

- **O1 — Verdict** — `Borrow` / `Borrow Less` / `Don't Borrow`, with one or more plain-English reasons tied to the user's inputs.
- **O2 — Maximum Capacity** — **Lender Sanction Max** vs. **Borrower Safe Capacity**, with an explicit "which number should you use?" recommendation. The safe number is guaranteed to be ≤ the lender number.
- **O3 — Fair Rate & APR** — Fair rate band + estimated all-in APR (processing fee folded in) + processing fee shown separately. Confidence level (LOW / MEDIUM / HIGH) widens or tightens the band.
- **O4 — Safe EMI & Stress** — Safe EMI ceiling + tenure trade-off table (24 / 36 / 48 / 60 / 84 months) + at least one calculated stress scenario (20% income drop, 15% income drop, +200 bps rate shock).
- **Negotiation Card** — A printable 1-page summary with the recommended number, the lender sanction, the safe EMI, the fair rate band, the APR, the recommended tenure, "What to ask the lender" prompts, "Why this range" reasons, and a stress check.

Every numeric output has an inline **Why?** toggle exposing the rule ID and the plain-English justification.

## Architecture

```
src/
├── App.tsx                     # Stage machine: intake → questionnaire → outputs
├── main.tsx                    # React entrypoint
├── index.css                   # Tailwind + print rules
├── components/
│   ├── Questionnaire.tsx       # Adaptive 14-step form with live preview
│   ├── Outputs.tsx             # Renders O1, O2, O3, O4 cards
│   └── NegotiationCard.tsx     # Printable 1-page summary
└── engine/
    ├── types.ts                # Input/output type model — Money/Count explicitly distinguish known from unknown
    ├── money.ts                # INR formatting + input validation
    ├── math.ts                 # EMI / principalFromEmi / age-based tenure cap
    ├── products.ts             # Product routing + collateral LTV
    ├── affordability.ts        # Lender FOIR cap, safe FOIR cap, secured LTV handling
    ├── rates.ts                # Rate band engine (product baseline + risk + documentation + CIBIL uncertainty)
    ├── apr.ts                  # Estimated APR methodology
    ├── verdict.ts              # O1: Borrow / Borrow Less / Don't Borrow
    ├── capacity.ts             # O2: lender max vs. safe (public shape)
    ├── stress.ts               # O4: EMI ceiling + stress scenarios
    ├── confidence.ts           # Confidence score (HIGH / MEDIUM / LOW)
    ├── personas.ts             # The three brief personas
    └── rules.ts                # Top-level entrypoint: `evaluate(input)`
```

All calculations live in `src/engine/`. UI components import pure functions only.

## How adaptive questions work

Each step has a `show(input)` predicate. Steps that don't apply to the selected profile are skipped — informal borrowers skip "business vintage", salaried borrowers skip "cash income range", large-ask profiles get the collateral step, and so on. Every step has a `why` field explaining which output it changes.

The data model distinguishes **known numeric zero** from **unknown** for every financially meaningful field (`netMonthlyIncome`, `existingEmi`, `monthlyEssentials`, `recentBounces`). Selecting "I don't know" keeps the field as `unknown` and lowers confidence — the calculator never silently substitutes zero.

## How outputs are calculated

- **O1 (Verdict)** — `src/engine/verdict.ts`. Triggers `Don't Borrow` for debt-trap patterns (bounce + high-cost debt, or >50% income to high-cost debt) and for sustainability failures where even a reduced amount cannot fit. Returns `Borrow Less` when the full ask fails FOIR but a smaller amount would work. Returns `Borrow` otherwise.
- **O2 (Capacity)** — `src/engine/affordability.ts` + `src/engine/capacity.ts`. Lender sanction uses the lender-side FOIR cap (50% / 40% / 30% by employment). Safe capacity takes the smaller of (conservative FOIR ceiling) and (disposable-income ceiling), with a tighter 10-point buffer below the lender cap. For secured products the LTV cap is also considered.
- **O3 (Rate)** — `src/engine/rates.ts`. The headline band starts from a product baseline, then adds a risk adjustment (driven by CIBIL, bounces, high-cost debt, income volatility) and a documentation adjustment (driven by `incomeDocumentation`). CIBIL unknown widens the band ±2%. APR is computed by amortising the processing fee over tenure in years — see `src/engine/apr.ts`.
- **O4 (Stress)** — `src/engine/stress.ts`. Safe EMI = the borrower's disposable monthly capacity. Tenure table at midpoint rate. Three scenarios: 20% income drop, 15% income drop, +200 bps rate shock.

## Running the three personas

```bash
npm run personas
```

Prints full O1–O4 outputs for Priya, Ravi, and Anita.

Or click the persona buttons on the home page of the running app.

## Tests

```bash
npm test
```

The test harness covers:

- EMI math (round-trip, 0% edge case)
- Unknown vs zero semantics — unknown values produce 0 capacity, not silent substitution
- Safe capacity ≤ lender capacity (the historical bug this refactor closed)
- Persona routing (Priya → PL, Ravi → LAP, Anita → Don't Borrow)
- Confidence model genuinely widens the rate band
- Bounce + high-cost debt triggers Don't Borrow (R05)
- Input validation warnings
- Stress scenarios produce real numbers
- APR strictly exceeds nominal rate

## Documentation

- [REQUIREMENTS.md](./REQUIREMENTS.md) — product requirements and persona specs.
- [RULES.md](./RULES.md) — every rule, threshold, and its justification (SOURCE / MY JUDGEMENT / SIMPLIFIED ASSUMPTION).
- [PERSONA_RUNS.md](./PERSONA_RUNS.md) — full traces for Priya, Ravi, Anita.
- [DELIVERABLES_CHECKLIST.md](./DELIVERABLES_CHECKLIST.md) — submission checklist with the assignment compliance status.

## Known limitations

- **No live data.** The engine works from user-supplied inputs. It cannot pull a real bureau file.
- **No lender-specific quotes.** Rate bands reflect market medians.
- **No APR regulation-grade calculation.** We exclude insurance, stamp duty, and documentation charges; see `src/engine/apr.ts`.
- **No persistence.** Closing the tab deletes everything.
- **FOIR caps are judgements.** They are calibrated to common Indian retail practice, not sourced from any regulator.

## Privacy

No network requests at runtime. No `localStorage`, no `sessionStorage`, no IndexedDB, no cookies, no analytics scripts. Production build is a static bundle; you can host it on any static host.