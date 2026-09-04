import { useMemo, useState } from 'react';
import {
  evaluate,
  PERSONAS,
  type BorrowerInput,
  type EngineResult,
} from './engine/rules';
import Questionnaire, { blankInput } from './components/Questionnaire';
import Outputs from './components/Outputs';
import NegotiationCard from './components/NegotiationCard';

export type Stage = 'intake' | 'questionnaire' | 'outputs';

export default function App() {
  const [stage, setStage] = useState<Stage>('intake');
  const [input, setInput] = useState<BorrowerInput | null>(null);

  const result: EngineResult | null = useMemo(
    () => (input ? evaluate(input) : null),
    [input],
  );

  function applyPersona(name: keyof typeof PERSONAS) {
    setInput({ ...PERSONAS[name].input });
    setStage('outputs');
  }

  function startQuestionnaire() {
    setInput(blankInput());
    setStage('questionnaire');
  }

  function onSubmitQuestionnaire(value: BorrowerInput) {
    setInput(value);
    setStage('outputs');
  }

  function reset() {
    setInput(null);
    setStage('intake');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header onReset={reset} stage={stage} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {stage === 'intake' && (
          <Intake
            onApplyPersona={applyPersona}
            onStartQuestionnaire={startQuestionnaire}
          />
        )}

        {stage === 'questionnaire' && input && (
          <Questionnaire
            value={input}
            onChange={setInput}
            onSubmit={() => onSubmitQuestionnaire(input)}
            onBack={() => setStage('intake')}
          />
        )}

        {stage === 'outputs' && input && result && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Your assessment
                </h2>
                <p className="text-sm text-slate-600">
                  Inputs are processed in-memory only. Nothing leaves your browser.
                </p>
              </div>
              <button
                onClick={reset}
                className="text-sm px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-100"
              >
                Start over
              </button>
            </div>
            <Outputs input={input} result={result} />
            <NegotiationCard input={input} result={result} />
          </div>
        )}

        {/* Methodology line */}
        <p className="mt-8 text-xs text-slate-500 text-center">
          Methodology: transparent rules and assumptions documented in RULES.md.
        </p>
      </main>

      <Footer />
    </div>
  );
}

function Header({
  onReset,
  stage,
}: {
  onReset: () => void;
  stage: Stage;
}) {
  return (
    <header className="border-b border-slate-200 bg-white no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            Borrower Copilot
          </button>
          <p className="text-xs text-slate-500">
            Privacy-first loan self-assessment · runs entirely in your browser
          </p>
        </div>
        <div className="flex gap-2">
          {stage !== 'intake' && (
            <button
              onClick={onReset}
              className="text-sm px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-100"
            >
              Start over
            </button>
          )}
          {stage === 'outputs' && (
            <button
              onClick={() => window.print()}
              className="text-sm px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
            >
              Print Negotiation Card
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-slate-500 flex flex-wrap gap-4 justify-between">
        <span>
          Borrower Copilot is an educational tool, not a lender. No bureau pulls,
          no API calls, no data stored.
        </span>
      </div>
    </footer>
  );
}

function Intake({
  onApplyPersona,
  onStartQuestionnaire,
}: {
  onApplyPersona: (name: keyof typeof PERSONAS) => void;
  onStartQuestionnaire: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Try a sample borrower
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          See how Borrower Copilot works with one of the profiles from the brief.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {(Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]).map((k) => (
            <button
              key={k}
              onClick={() => onApplyPersona(k)}
              className="flex flex-col items-start rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <div className="font-medium text-slate-900 mb-1">
                {PERSONAS[k].label}
              </div>
              <div className="text-xs text-slate-600 mb-2">
                {PERSONAS[k].description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 py-2" aria-hidden="true">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-sm text-slate-500">OR</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Start with 8 essential questions
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          We only ask what can change your result. Additional questions appear only when they matter.
        </p>
        <button
          onClick={onStartQuestionnaire}
          className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Start questionnaire →
        </button>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900">
          What you'll get
        </h2>

        <div className="border border-slate-200 bg-slate-50 rounded-lg p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col">
              <h3 className="text-sm font-medium text-slate-900 mb-1">
                VERDICT
              </h3>
              <p className="text-xs text-slate-600">
                Borrow / Borrow Less / Don't Borrow
              </p>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-medium text-slate-900 mb-1">
                SAFE AMOUNT
              </h3>
              <p className="text-xs text-slate-600">
                What you can responsibly carry
              </p>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-medium text-slate-900 mb-1">
                FAIR RATE
              </h3>
              <p className="text-xs text-slate-600">
                Your profile-based rate range
              </p>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-medium text-slate-900 mb-1">
                EMI CEILING
              </h3>
              <p className="text-xs text-slate-600">
                A monthly amount you should not cross
              </p>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-medium text-slate-900 mb-1">
                NEGOTIATION CARD
              </h3>
              <p className="text-xs text-slate-600">
                A lender-ready summary to take with you
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}