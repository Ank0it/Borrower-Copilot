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
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900">
            Borrower Copilot
          </h1>
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
        <span>Built on R01–R09 in RULES.md.</span>
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
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Quick-fill a persona
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Try one of the three test profiles from the brief.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {(Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]).map((k) => (
            <button
              key={k}
              onClick={() => onApplyPersona(k)}
              className="text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <div className="font-medium text-slate-900">
                {PERSONAS[k].label}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {PERSONAS[k].description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Or answer 8 quick questions
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          We only ask what changes a number. Adaptive pathing skips irrelevant
          questions for your profile.
        </p>
        <button
          onClick={onStartQuestionnaire}
          className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
        >
          Start questionnaire →
        </button>
      </section>
    </div>
  );
}