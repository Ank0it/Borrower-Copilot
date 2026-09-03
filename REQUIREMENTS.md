# Borrower Copilot - Project Requirements

## Objective
Build a privacy-first, client-side personal assistant (no backend, no bureau calls, no data storage) that empowers Indian borrowers with transparent credit assessments and a negotiation card before visiting a lender[cite: 1].

## Core Outputs Required
1. **O1: Borrow Verdict**: Options: `Borrow`, `Don't borrow`, or `Borrow less` with a explicit reason[cite: 1].
2. **O2: Maximum Capacity**: Distinct separation between **Lender Sanction Max** vs. **Borrower Safe Capacity**, with a clear recommendation on which to use[cite: 1].
3. **O3: Fair Rate & All-in APR**: Interest rate range band + total APR (factoring in processing fees)[cite: 1].
4. **O4: Safe EMI & Stress Test**: Monthly EMI ceiling, tenure trade-off analysis, and 1 stress case scenario (e.g., income drop or interest rate rise)[cite: 1].
5. **Negotiation Card**: A single printable/viewable summary screen comparing market quotes against fair borrower profile metrics[cite: 1].

## Question & Logic Engine Rules
* **Must Questions (~8-10)**: Establish wide bands and low confidence metrics[cite: 1].
* **Additional Questions**: Must dynamically refine and tighten specific outputs (cut any question that does not move a number)[cite: 1].
* **Adaptive Flow**: Dynamic paths based on employment type (Salaried IT vs. Self-Employed Kirana vs. Informal Delivery)[cite: 1].
* **Uncertainty Principle**: Missing inputs expand confidence bands; "Unknown credit score" is treated as unknown, not zero[cite: 1].
* **Single-Sentence Traceability**: Every numeric ceiling must have a 1-sentence plain English justification[cite: 1].
* **Indian Financial Context**: Use FOIR (Fixed Obligation to Income Ratio) limits, RBI-style all-in APR calculations, and realistic Indian loan product bands (Personal, LAP, Gold, Vehicle, Business)[cite: 1].

## Persona Test Cases
* **Priya (29, Bengaluru)**: Salaried MNC Engineer (₹1,10,000/mo net)[cite: 1].
  * Current debt/costs: Car EMI ₹14,000 (2 yrs left), Rent ₹28,000, Credit Score 780[cite: 1].
  * Request: ₹8,00,000 Personal Loan for wedding[cite: 1].
* **Ravi (42, Mysuru)**: Self-employed Kirana shopkeeper (Cash ₹40k-80k/mo, ITR ₹4,20,000/yr)[cite: 1].
  * Assets/Debt: Owns shop premises unencumbered (val. ₹45,00,000), no formal credit history (no score), Wife earns ₹18,000 teaching[cite: 1].
  * Request: ₹15,00,000 for second stock line and delivery vehicle[cite: 1].
* **Anita (35, Hubballi)**: Informal delivery rider + home tailoring (₹26,000-30,000/mo)[cite: 1].
  * Household/Debt: 2 children, husband unemployed 8 months, 3 app loans outstanding (₹35,000 total @ 30%+ interest), 1 EMI bounce last month[cite: 1].
  * Request: ₹1,50,000 for electric scooter[cite: 1].