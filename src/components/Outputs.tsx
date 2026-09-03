import {
  type EngineResult,
  type Verdict,
  inr,
  productLabel,
} from '../engine/rules';

/**
 * Hierarchical output screen:
 *   PRIMARY  → verdict (what to do)
 *   SECONDARY→ the three big numbers: lender max, safe amount, safe EMI
 *   TERTIARY → rate band, APR, confidence, tenure trade-off
 *   DETAILS  → expandable "Why?" per number + full assumptions list
 *
 * Every numeric output has an inline "Why" toggle so the borrower never has
 * to inspect source code to understand a number.
 */
export default function Outputs({
  result,
}: {
  input: unknown;
  result: EngineResult;
}) {
  const { verdict, capacity, rate, stress, confidence, warnings } = result;

  return (
    <div className="space-y-6">
      {/* PRIMARY: verdict */}
      <section className="rounded-xl border-2 border-slate-900 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <VerdictBadge verdict={verdict.verdict} />
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{verdictHeadline(verdict.verdict)}</h2>
              <p className="text-sm text-slate-700 mt-1">{verdict.reason}</p>
            </div>
          </div>
          <ConfidenceBadge level={confidence.level} missingCount={confidence.missingCritical.length} />
        </div>

        {verdict.reasons.length > 1 && (
          <ul className="mt-4 list-disc pl-5 text-sm text-slate-700 space-y-1">
            {verdict.reasons.slice(1).map((r, i) => (<li key={i}>{r}</li>))}
          </ul>
        )}
      </section>

      {/* SECONDARY: big numbers */}
      <section className="grid sm:grid-cols-3 gap-4">
        <BigStat
          label="Lender sanction (likely)"
          value={inr(capacity.lenderSanctionMax)}
          sub="What a bank may approve"
          tone={capacity.lenderSanctionMax === 0 ? 'warning' : 'neutral'}
          whyText={capacity.rationaleLender.text}
          ruleId={capacity.rationaleLender.ruleId}
        />
        <BigStat
          label="Safe amount (recommended)"
          value={inr(capacity.borrowerSafeCapacity)}
          sub="What you should actually borrow"
          tone="primary"
          whyText={capacity.rationaleSafe.text}
          ruleId={capacity.rationaleSafe.ruleId}
        />
        <BigStat
          label="Safe EMI ceiling"
          value={inr(stress.safeEmi)}
          sub="Maximum monthly outflow"
          tone="primary"
          whyText={stress.rationaleSafeEmi.text}
          ruleId={stress.rationaleSafeEmi.ruleId}
        />
      </section>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="text-sm text-emerald-900">
          <strong>Which number should you use?</strong>{' '}
          {capacity.borrowerSafeCapacity > 0
            ? `Borrow the safe amount (${inr(capacity.borrowerSafeCapacity)}), not the lender sanction (${inr(capacity.lenderSanctionMax)}). The safe number is guaranteed to keep your EMI below your real disposable income.`
            : 'Based on your inputs, no safe borrowing amount emerges — see the verdict above.'}
        </div>
        <div className="text-xs text-emerald-800 mt-2">{capacity.rationaleRecommended.text}</div>
      </section>

      {/* TERTIARY: rate band, APR, confidence */}
      <section className="grid sm:grid-cols-3 gap-4">
        <Stat
          label="Fair rate band"
          value={`${rate.rateMin}% – ${rate.rateMax}% p.a.`}
          sub="Headline (nominal)"
          whyText={rate.rationaleBand.text}
          ruleId={rate.rationaleBand.ruleId}
        />
        <Stat
          label="Estimated APR"
          value={`${rate.aprMin}% – ${rate.aprMax}%`}
          sub="All-in (includes processing fee)"
          whyText={rate.rationaleApr.text}
          ruleId={rate.rationaleApr.ruleId}
        />
        <Stat
          label="Processing fee"
          value={`${(rate.processingFeePct * 100).toFixed(2)}%`}
          sub="One-time, paid upfront"
          whyText={`${(rate.processingFeePct * 100).toFixed(2)}% of the principal is charged upfront by most lenders. We amortise this over the loan tenure to estimate APR — see methodology note on the Negotiation Card.`}
          ruleId="R-APR"
        />
      </section>

      {/* Product + tenure trade-off */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900">Product & tenure</h3>
          <RuleTag id={rate.rationaleProduct.ruleId} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Stat
            label="Recommended product"
            value={productLabel(rate.recommendedProduct)}
            sub="Routing for your profile"
            whyText={rate.rationaleProduct.text}
            ruleId={rate.rationaleProduct.ruleId}
          />
          <Stat
            label="Proposed EMI (at midpoint rate)"
            value={inr(stress.proposedEmi)}
            sub={`For ${result.recommendedTenureMonths} months`}
            whyText={`EMI on the recommended principal at ${((rate.rateMin + rate.rateMax) / 2).toFixed(2)}% over ${result.recommendedTenureMonths} months (capped so the loan ends by age 60).`}
            ruleId="R-EMI"
          />
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium text-slate-800 mb-2">Tenure trade-off</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4">Tenure</th>
                  <th className="py-2 pr-4">EMI</th>
                  <th className="py-2 pr-4">Total interest</th>
                </tr>
              </thead>
              <tbody>
                {stress.tenureOptions.map((t) => (
                  <tr key={t.months} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-medium text-slate-800">{t.months} months</td>
                    <td className="py-2 pr-4">{inr(t.emi)}</td>
                    <td className="py-2 pr-4">{inr(t.totalInterest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Stress scenarios */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900 mb-3">Stress test</h3>
        <div className="space-y-3">
          {stress.scenarios.map((s, i) => (
            <div key={i} className={`rounded-md border p-3 ${s.survives ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-300 bg-rose-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.rationale.text}</div>
                </div>
                <div className={`shrink-0 px-2 py-1 rounded text-xs font-semibold ${s.survives ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                  {s.survives ? 'Survives' : 'Does not survive'}
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Stressed safe EMI: <strong>{inr(s.stressedSafeEmi)}</strong> · EMI on loan: <strong>{inr(s.stressedEmi)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Confidence + warnings */}
      {(confidence.level !== 'high' || warnings.length > 0) && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Confidence: {confidence.level.toUpperCase()}.</strong>{' '}
          {confidence.rationale.text}
          {warnings.length > 0 && (
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {warnings.map((w, i) => (<li key={i}>{w}</li>))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function verdictHeadline(v: Verdict): string {
  switch (v) {
    case 'Borrow':
      return 'You can borrow — with the listed guardrails.';
    case 'Borrow Less':
      return 'Borrow less, not the full amount.';
    case "Don't Borrow":
      return 'Don’t take this loan right now.';
  }
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const tone =
    verdict === 'Borrow'
      ? 'bg-emerald-600 text-white border-emerald-700'
      : verdict === 'Borrow Less'
        ? 'bg-amber-500 text-white border-amber-600'
        : 'bg-rose-600 text-white border-rose-700';
  return (
    <span className={`shrink-0 inline-flex items-center rounded-md border px-3 py-2 text-sm font-bold ${tone}`}>
      {verdict.toUpperCase()}
    </span>
  );
}

function ConfidenceBadge({ level, missingCount }: { level: string; missingCount: number }) {
  const tone =
    level === 'high'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
      : level === 'medium'
        ? 'bg-amber-100 text-amber-900 border-amber-300'
        : 'bg-rose-100 text-rose-900 border-rose-300';
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold uppercase tracking-wide">Confidence: {level}</div>
      {missingCount > 0 && <div className="text-[11px] mt-0.5">{missingCount} missing input(s)</div>}
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
  whyText,
  ruleId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'primary' | 'warning' | 'neutral';
  whyText: string;
  ruleId: string;
}) {
  const toneCls =
    tone === 'primary' ? 'border-slate-900 bg-white' : tone === 'warning' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border-2 p-5 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl sm:text-3xl font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      <Why text={whyText} ruleId={ruleId} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  whyText,
  ruleId,
}: {
  label: string;
  value: string;
  sub?: string;
  whyText: string;
  ruleId: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
      <Why text={whyText} ruleId={ruleId} />
    </div>
  );
}

function Why({ text, ruleId }: { text: string; ruleId: string }) {
  return (
    <details className="mt-2">
      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-800 select-none">
        Why? <span className="text-slate-400">[{ruleId}]</span>
      </summary>
      <div className="mt-2 text-xs text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-md p-3">
        {text}
      </div>
    </details>
  );
}

function RuleTag({ id }: { id: string }) {
  return <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400">{id}</span>;
}