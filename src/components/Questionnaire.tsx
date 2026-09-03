import { useMemo, useState } from 'react';
import {
  type BorrowerInput,
  type EmploymentType,
  type LoanPurpose,
  type IncomeDoc,
  evaluate,
  moneyKnown,
  countKnown,
  labelEmployment,
  pct,
  productLabel,
  assessConfidence,
} from '../engine/rules';

/** Blank slate input. Every financially meaningful field is "unknown" by default. */
export function blankInput(): BorrowerInput {
  return {
    age: 30,
    employment: 'salaried',
    netMonthlyIncome: { kind: 'unknown' },
    householdExtraIncome: { kind: 'unknown' },
    householdIncomeAvailableForLoan: false,
    cashIncomeRange: undefined,
    documentedMonthlyIncome: { kind: 'unknown' },
    businessVintageYears: undefined,
    incomeDocumentation: 'none',
    existingEmi: { kind: 'unknown' },
    highInterestDebtRatio: 0,
    highCostDebtOutstanding: { kind: 'unknown' },
    existingLoanCount: 0,
    monthlyEssentials: { kind: 'unknown' },
    dependents: 0,
    emergencyBufferMonths: 3,
    purpose: 'personal',
    requestedAmount: { kind: 'unknown' },
    requestedTenureMonths: 36,
    cibilScore: null,
    recentBounces: { kind: 'unknown' },
    hasCollateral: false,
    collateralValue: { kind: 'unknown' },
    collateralLtv: undefined,
  };
}

// ---------------------------------------------------------------------------
// Adaptive step definitions
// ---------------------------------------------------------------------------

type StepPatch = (patch: Partial<BorrowerInput>) => void;
type StepRender = (input: BorrowerInput, patch: StepPatch) => JSX.Element;

interface Step {
  id: string;
  title: string;
  why: string;
  render: StepRender;
  show: (input: BorrowerInput) => boolean;
}

const STEPS: Step[] = [
  {
    id: 'employment',
    title: 'Employment type',
    why: 'Changes FOIR cap, product routing, and rate band.',
    show: () => true,
    render: (input, patch) => (
      <ChoiceField
        label="Which best describes your work?"
        value={input.employment}
        options={[
          { value: 'salaried', label: 'Salaried', desc: 'Fixed salary + payslips + Form 16' },
          { value: 'self_employed', label: 'Self-employed', desc: 'ITR filed, business vintage > 2 yrs' },
          { value: 'informal', label: 'Informal / gig', desc: 'Cash income, no ITR' },
        ]}
        onChange={(v) => patch({ employment: v as EmploymentType })}
      />
    ),
  },
  {
    id: 'income',
    title: 'Your net monthly income',
    why: 'Drives every FOIR/EMI/capacity calculation.',
    show: () => true,
    render: (input, patch) => (
      <MoneyField
        label="Net monthly income (take-home)"
        hint="For self-employed use a 6-month average after business expenses."
        value={input.netMonthlyIncome}
        onChange={(m) => patch({ netMonthlyIncome: m })}
      />
    ),
  },
  {
    id: 'cash_range',
    title: 'Income variability (self-employed / informal)',
    why: 'Wider range widens the rate band and lowers confidence.',
    show: (input) => input.employment !== 'salaried',
    render: (input, patch) => (
      <CashRangeField
        value={input.cashIncomeRange}
        onChange={(r) => patch({ cashIncomeRange: r })}
      />
    ),
  },
  {
    id: 'income_doc',
    title: 'Income documentation',
    why: 'Self-employed without ITR are routinely downrated or rejected.',
    show: (input) => input.employment !== 'salaried',
    render: (input, patch) => (
      <ChoiceField
        label="How is your income documented?"
        value={input.incomeDocumentation}
        options={[
          { value: 'itr', label: 'ITR / audited financials', desc: 'Best — lenders recognise this' },
          { value: 'bank_statement', label: 'Bank statement only', desc: 'Limited — expect rate surcharge' },
          { value: 'none', label: 'No formal documentation', desc: 'Worst case for lenders' },
        ]}
        onChange={(v) => patch({ incomeDocumentation: v as IncomeDoc })}
      />
    ),
  },
  {
    id: 'business_vintage',
    title: 'Business vintage',
    why: 'Under 2 years flags "start-up risk" and may shrink lender sanction.',
    show: (input) => input.employment !== 'salaried',
    render: (input, patch) => (
      <NumberField
        label="Years in business"
        value={input.businessVintageYears ?? 0}
        onChange={(n) => patch({ businessVintageYears: n })}
        suffix="years"
      />
    ),
  },
  {
    id: 'household_extra',
    title: 'Spouse / household income',
    why: 'Adds to repayment capacity only if available for the loan.',
    show: () => true,
    render: (input, patch) => (
      <div className="space-y-4">
        <MoneyField
          label="Other household income (spouse, parents)"
          hint="Optional — leave Unknown if none."
          value={input.householdExtraIncome ?? { kind: 'unknown' }}
          onChange={(m) => patch({ householdExtraIncome: m })}
        />
        {input.householdExtraIncome?.kind === 'known' && (
          <BoolField
            label="Is this income available to service this loan (e.g. as co-applicant)?"
            value={input.householdIncomeAvailableForLoan ?? false}
            onChange={(v) => patch({ householdIncomeAvailableForLoan: v })}
          />
        )}
      </div>
    ),
  },
  {
    id: 'essentials',
    title: 'Essential monthly expenses',
    why: 'Subtracted from income to get safe capacity.',
    show: () => true,
    render: (input, patch) => (
      <MoneyField
        label="Rent, school fees, groceries, utilities, transport"
        hint="Include existing EMIs only if you want them counted separately below."
        value={input.monthlyEssentials}
        onChange={(m) => patch({ monthlyEssentials: m })}
      />
    ),
  },
  {
    id: 'dependents',
    title: 'Dependents',
    why: 'More dependents → bigger essentials assumption.',
    show: (input) => input.employment === 'informal' || input.employment === 'self_employed',
    render: (input, patch) => (
      <NumberField
        label="Children / dependents you support"
        value={input.dependents ?? 0}
        onChange={(n) => patch({ dependents: n })}
        suffix="people"
      />
    ),
  },
  {
    id: 'existing_emi',
    title: 'Existing EMIs',
    why: 'Subtracted from FOIR headroom.',
    show: () => true,
    render: (input, patch) => (
      <MoneyField
        label="Total existing EMI outflow per month"
        hint="Sum of all loan EMIs you currently pay. 'Unknown' is allowed — we'll be more conservative."
        value={input.existingEmi}
        onChange={(m) => patch({ existingEmi: m })}
      />
    ),
  },
  {
    id: 'high_interest',
    title: 'High-cost existing debt',
    why: 'Triggers R05 debt-trap detection if combined with bounces.',
    show: (input) =>
      input.employment === 'informal' ||
      (input.existingEmi.kind === 'known' && input.existingEmi.value > 0),
    render: (input, patch) => (
      <div className="space-y-4">
        <NumberField
          label="Approx % of income going to loans charging > 25% interest"
          hint="App-based loans typically charge 1.5–3% per month (= 18–36% p.a.)."
          value={Math.round(input.highInterestDebtRatio * 100)}
          onChange={(n) => patch({ highInterestDebtRatio: Math.max(0, Math.min(1, n / 100)) })}
          suffix="% of income"
        />
        <MoneyField
          label="Outstanding principal on those high-cost loans"
          hint="Optional — used by the consolidation note if your ask is debt consolidation."
          value={input.highCostDebtOutstanding ?? { kind: 'unknown' }}
          onChange={(m) => patch({ highCostDebtOutstanding: m })}
        />
      </div>
    ),
  },
  {
    id: 'bounces',
    title: 'Recent EMI bounces',
    why: 'A bounce + high-cost debt triggers Don’t Borrow (R05).',
    show: () => true,
    render: (input, patch) => (
      <CountField
        label="EMI bounces in the last 12 months"
        hint="0 = none, 1+ = check your bank statement. 'Unknown' widens confidence."
        value={input.recentBounces}
        onChange={(c) => patch({ recentBounces: c })}
      />
    ),
  },
  {
    id: 'credit_score',
    title: 'Credit score',
    why: 'Unknown score widens rate band by ±2%.',
    show: () => true,
    render: (input, patch) => (
      <CreditScoreField
        value={input.cibilScore}
        onChange={(v) => patch({ cibilScore: v })}
      />
    ),
  },
  {
    id: 'collateral',
    title: 'Asset-backed collateral',
    why: 'Self-employed with collateral → secured product at half the rate.',
    show: (input) =>
      input.employment === 'self_employed' || input.requestedAmount.kind === 'known' && input.requestedAmount.value >= 500000,
    render: (input, patch) => (
      <div className="space-y-4">
        <BoolField
          label="Do you own any unencumbered property or asset that could be collateralised?"
          hint="Shop, house, land, FD — anything you could pledge."
          value={input.hasCollateral}
          onChange={(v) => patch({ hasCollateral: v })}
        />
        {input.hasCollateral && (
          <MoneyField
            label="Approx market value of that asset"
            value={input.collateralValue ?? { kind: 'unknown' }}
            onChange={(m) => patch({ collateralValue: m })}
          />
        )}
      </div>
    ),
  },
  {
    id: 'purpose',
    title: 'Loan purpose',
    why: 'Routes to the right product (PL / LAP / vehicle / home).',
    show: () => true,
    render: (input, patch) => (
      <ChoiceField
        label="What is the loan for?"
        value={input.purpose}
        options={[
          { value: 'personal', label: 'Personal / Wedding / Medical' },
          { value: 'business', label: 'Business / Stock / Equipment' },
          { value: 'vehicle', label: 'Vehicle (car / EV / two-wheeler)' },
          { value: 'home_renovation', label: 'Home renovation' },
          { value: 'debt_consolidation', label: 'Debt consolidation' },
          { value: 'education', label: 'Education' },
        ]}
        onChange={(v) => patch({ purpose: v as LoanPurpose })}
      />
    ),
  },
  {
    id: 'amount',
    title: 'Requested amount',
    why: 'Defines the principal on which every EMI/APR number is computed.',
    show: () => true,
    render: (input, patch) => (
      <MoneyField
        label="How much do you want to borrow?"
        value={input.requestedAmount}
        onChange={(m) => patch({ requestedAmount: m })}
      />
    ),
  },
  {
    id: 'tenure',
    title: 'Requested tenure',
    why: 'Affects EMI, total interest, and is capped by age (60).',
    show: () => true,
    render: (input, patch) => (
      <NumberField
        label="Tenure (in months)"
        hint="Most personal loans: 12–60 months. LAP / vehicle: up to 84. We will cap so the loan ends by age 60."
        value={input.requestedTenureMonths}
        onChange={(n) => patch({ requestedTenureMonths: Math.max(6, Math.round(n)) })}
        suffix="months"
      />
    ),
  },
  {
    id: 'age',
    title: 'Your age',
    why: 'Caps maximum tenure (loan must end by age 60).',
    show: () => true,
    render: (input, patch) => (
      <NumberField
        label="Age"
        value={input.age}
        onChange={(n) => patch({ age: Math.max(18, Math.min(80, Math.round(n))) })}
        suffix="yrs"
      />
    ),
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Questionnaire({
  value,
  onChange,
  onSubmit,
  onBack,
}: {
  value: BorrowerInput;
  onChange: (v: BorrowerInput) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const visibleSteps = useMemo(() => STEPS.filter((s) => s.show(value)), [value]);
  const [index, setIndex] = useState(0);
  const step = visibleSteps[index];
  const isLast = index === visibleSteps.length - 1;

  const patch: StepPatch = (p) => onChange({ ...value, ...p });
  const live = useMemo(() => evaluate(value), [value]);
  const confidence = useMemo(() => assessConfidence(value), [value]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-6 no-print">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-slate-500">
            Question {index + 1} of {visibleSteps.length}
            {step && <span className="ml-2 text-slate-400">— {step.why}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onBack} className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100">← Home</button>
            <button
              disabled={index === 0}
              onClick={() => setIndex(Math.max(0, index - 1))}
              className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
            >Back</button>
            {isLast ? (
              <button onClick={onSubmit} className="text-sm px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800">See my numbers →</button>
            ) : (
              <button onClick={() => setIndex(Math.min(visibleSteps.length - 1, index + 1))} className="text-sm px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800">Next →</button>
            )}
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-900 mb-2">{step.title}</h2>
        {step.render(value, patch)}

        <div className="mt-6 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-slate-900 transition-all" style={{ width: `${((index + 1) / visibleSteps.length) * 100}%` }} />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Live preview</div>
          <div className="mt-2 text-sm text-slate-700">Profile: <strong>{labelEmployment(value.employment)}</strong></div>
          <div className="mt-1 text-sm text-slate-700">FOIR ceiling: <strong>{pct(live.capacity.lenderFoirCap)}</strong></div>
          <div className="mt-1 text-sm text-slate-700">Confidence: <strong className="capitalize">{confidence.level}</strong></div>
          {value.requestedAmount.kind === 'known' && value.requestedAmount.value > 0 && (
            <div className="mt-1 text-sm text-slate-700">
              Indicative EMI: <strong>₹{Math.round(live.stress.proposedEmi).toLocaleString('en-IN')}</strong>
              <span className="text-slate-500"> / mo @ ~{((live.rate.rateMin + live.rate.rateMax) / 2).toFixed(1)}%</span>
            </div>
          )}
          <div className="mt-1 text-sm text-slate-700">
            Likely product: <strong>{productLabel(live.rate.recommendedProduct)}</strong>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900">
          <strong>Privacy:</strong> your inputs live only in this browser tab. Close it and they vanish — no analytics, no API, no database.
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-800 mb-1">{label}</div>
      {hint && <div className="text-xs text-slate-500 mb-2">{hint}</div>}
      <div className="flex items-stretch rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-slate-900">
        {prefix && (
          <span className="px-3 flex items-center text-slate-500 bg-slate-50 border-r border-slate-300 rounded-l-md">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 px-3 py-2 text-sm focus:outline-none rounded-md"
        />
        {suffix && (
          <span className="px-3 flex items-center text-slate-500 bg-slate-50 border-l border-slate-300 rounded-r-md">{suffix}</span>
        )}
      </div>
    </label>
  );
}

/** Three-state money field: known / unknown / 0. */
function MoneyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: { kind: 'known'; value: number } | { kind: 'unknown' };
  onChange: (m: { kind: 'known'; value: number } | { kind: 'unknown' }) => void;
}) {
  const [mode, setMode] = useState<'known' | 'unknown'>(value.kind === 'known' ? 'known' : 'unknown');
  const [num, setNum] = useState<number>(value.kind === 'known' ? value.value : 0);

  return (
    <div>
      <div className="text-sm font-medium text-slate-800 mb-1">{label}</div>
      {hint && <div className="text-xs text-slate-500 mb-2">{hint}</div>}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => {
            setMode('known');
            onChange(moneyKnown(num));
          }}
          className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'known' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
        >
          I know the value
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('unknown');
            onChange({ kind: 'unknown' });
          }}
          className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'unknown' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
        >
          I don't know
        </button>
      </div>
      {mode === 'known' && (
        <NumberField
          label=""
          value={num}
          onChange={(n) => {
            setNum(n);
            onChange(moneyKnown(n));
          }}
          prefix="₹"
        />
      )}
      {mode === 'unknown' && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          We'll treat this as unknown — calculations stay conservative and confidence lowers.
        </div>
      )}
    </div>
  );
}

/** Three-state count field. */
function CountField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: { kind: 'known'; value: number } | { kind: 'unknown' };
  onChange: (c: { kind: 'known'; value: number } | { kind: 'unknown' }) => void;
}) {
  const [mode, setMode] = useState<'known' | 'unknown'>(value.kind === 'known' ? 'known' : 'unknown');
  const [num, setNum] = useState<number>(value.kind === 'known' ? value.value : 0);

  return (
    <div>
      <div className="text-sm font-medium text-slate-800 mb-1">{label}</div>
      {hint && <div className="text-xs text-slate-500 mb-2">{hint}</div>}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setMode('known'); onChange(countKnown(num)); }}
          className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'known' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
        >
          I know
        </button>
        <button
          type="button"
          onClick={() => { setMode('unknown'); onChange({ kind: 'unknown' }); }}
          className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'unknown' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
        >
          I don't know
        </button>
      </div>
      {mode === 'known' && (
        <NumberField
          label=""
          value={num}
          onChange={(n) => { setNum(n); onChange(countKnown(n)); }}
        />
      )}
    </div>
  );
}

function BoolField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-800 mb-1">{label}</div>
      {hint && <div className="text-xs text-slate-500 mb-2">{hint}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange(true)} className={`px-3 py-1.5 rounded-md border text-sm ${value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>Yes</button>
        <button type="button" onClick={() => onChange(false)} className={`px-3 py-1.5 rounded-md border text-sm ${!value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>No</button>
      </div>
    </div>
  );
}

function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-800 mb-2">{label}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`text-left rounded-md border p-3 transition ${value === o.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-400'}`}
          >
            <div className="text-sm font-medium">{o.label}</div>
            {o.desc && <div className={`text-xs mt-0.5 ${value === o.value ? 'text-slate-200' : 'text-slate-500'}`}>{o.desc}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function CashRangeField({
  value,
  onChange,
}: {
  value: { min: number; max: number } | undefined;
  onChange: (v: { min: number; max: number } | undefined) => void;
}) {
  const enabled = !!value;
  return (
    <div>
      <BoolField
        label="Do your monthly earnings vary a lot?"
        hint="A wide range widens the rate band and lowers confidence."
        value={enabled}
        onChange={(v) => onChange(v ? { min: 40000, max: 80000 } : undefined)}
      />
      {enabled && value && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <NumberField label="Low month" value={value.min} onChange={(n) => onChange({ ...value, min: n })} prefix="₹" />
          <NumberField label="High month" value={value.max} onChange={(n) => onChange({ ...value, max: n })} prefix="₹" />
        </div>
      )}
    </div>
  );
}

function CreditScoreField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [mode, setMode] = useState<'known' | 'unknown'>(value === null ? 'unknown' : 'known');
  const [num, setNum] = useState<number>(value ?? 750);

  return (
    <div>
      <div className="text-sm font-medium text-slate-800 mb-1">CIBIL / bureau score</div>
      <div className="text-xs text-slate-500 mb-2">
        Don't know? That's fine — we widen your rate band rather than guess.
      </div>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => { setMode('known'); onChange(num); }} className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'known' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
          I know my score
        </button>
        <button type="button" onClick={() => { setMode('unknown'); onChange(null); }} className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'unknown' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
          Unknown
        </button>
      </div>
      {mode === 'known' && (
        <NumberField
          label="Score"
          value={num}
          onChange={(v) => { setNum(v); onChange(v); }}
          suffix="(300–900)"
        />
      )}
    </div>
  );
}