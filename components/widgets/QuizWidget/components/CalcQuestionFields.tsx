// Random-number questions in the quiz editor: the numbers under the prompt and the formula answer.
import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { CalcSpec, CalcVariable, QuizQuestion } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { PromptText } from '@/components/common/PromptText';
import {
  CALC_MAX_DECIMALS,
  calcModifiedNeedsAnswer,
  calcSeed,
  drawCalcValues,
  fillCalcPrompt,
  formatCalcAnswer,
} from '@/utils/quizCalculated';
import {
  calcFormulaProblem,
  calcModifiedProblem,
} from '@/utils/quizCalcProblem';
import { inputClass, labelClass } from './quizEditorFieldStyles';
import { DraftNumberInput } from './DraftNumberInput';

const smallInput =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 text-sm px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary';

const VarName: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex shrink-0 items-center justify-center min-w-7 h-7 px-1.5 rounded-md bg-brand-blue-lighter/40 text-brand-blue-dark font-bold text-sm italic">
    {name}
  </span>
);

const SAMPLE_KEYS = Array.from({ length: 12 }, (_, i) => `sample-${i + 1}`);

/** Sample numbers the editor previews with; never a real student's. */
const sampleValues = (q: QuizQuestion, sample: number) =>
  q.calc
    ? drawCalcValues(
        q.calc,
        calcSeed(q.calc.seed, SAMPLE_KEYS[sample % SAMPLE_KEYS.length], q.id)
      )
    : {};

/** Under the prompt: a sample of what a student sees, then one row per random number. */
export const CalcNumbersSection: React.FC<{
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  sample: number;
  onNextSample: () => void;
}> = ({ question: q, onChange, sample, onNextSample }) => {
  const calc = q.calc;
  if (!calc || calc.variables.length === 0) return null;
  const values = sampleValues(q, sample);
  const setVariable = (name: string, patch: Partial<CalcVariable>) =>
    onChange({
      calc: {
        ...calc,
        variables: calc.variables.map((v) =>
          v.name === name ? fixRange({ ...v, ...patch }, patch) : v
        ),
      },
    });
  const remove = (name: string) => {
    const variables = calc.variables.filter((v) => v.name !== name);
    onChange(
      variables.length > 0
        ? { calc: { ...calc, variables } }
        : { calc: undefined, correctAnswer: '' }
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2">
        <p className="flex-1 min-w-0 text-sm text-slate-800 whitespace-pre-line wrap-break-word">
          <PromptText text={fillCalcPrompt(q.text, calc, values)} />
        </p>
        <button
          type="button"
          onClick={onNextSample}
          title="New numbers"
          aria-label="New numbers"
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 touch-target-expand"
          {...tourTypeAttr('quiz-editor.calc-new-numbers', 'quiz')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div>
        <span className={labelClass}>Random numbers</span>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {calc.variables.map((v) => (
            <div
              key={v.name}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
            >
              <VarName name={v.name} />
              <label className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 ml-1">
                  From
                </span>
                <span className="w-20">
                  <DraftNumberInput
                    value={v.min}
                    onCommit={(min) => setVariable(v.name, { min })}
                    className={smallInput}
                    aria-label={`${v.name} from`}
                    anchor={tourTypeAttr('quiz-editor.calc-from', 'quiz')}
                  />
                </span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">to</span>
                <span className="w-20">
                  <DraftNumberInput
                    value={v.max}
                    onCommit={(max) => setVariable(v.name, { max })}
                    className={smallInput}
                    aria-label={`${v.name} to`}
                    anchor={tourTypeAttr('quiz-editor.calc-to', 'quiz')}
                  />
                </span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 ml-2">
                  Decimals
                </span>
                <span className="w-14">
                  <DraftNumberInput
                    integer
                    min={0}
                    max={CALC_MAX_DECIMALS}
                    value={v.decimals}
                    onCommit={(decimals) => setVariable(v.name, { decimals })}
                    className={smallInput}
                    aria-label={`${v.name} decimals`}
                    anchor={tourTypeAttr('quiz-editor.calc-decimals', 'quiz')}
                  />
                </span>
              </label>
              <button
                type="button"
                onClick={() => remove(v.name)}
                aria-label={`Remove ${v.name}`}
                title={`Remove ${v.name}`}
                className="ml-auto p-1 text-slate-400 hover:text-brand-red-primary touch-target-expand"
                {...tourTypeAttr('quiz-editor.calc-remove', 'quiz')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Keeps From at or below To: the field just edited wins. */
function fixRange(v: CalcVariable, patch: Partial<CalcVariable>): CalcVariable {
  if (v.min <= v.max) return v;
  return patch.min !== undefined ? { ...v, max: v.min } : { ...v, min: v.max };
}

/** Correct Answer for a random-number question: the formula, how close counts, rounding and unit. */
export const CalcAnswerField: React.FC<{
  question: QuizQuestion;
  onChange: (updates: Partial<QuizQuestion>) => void;
  sample: number;
}> = ({ question: q, onChange, sample }) => {
  const calc = q.calc;
  if (!calc) return null;
  const set = (patch: Partial<CalcSpec>) =>
    onChange({
      calc: { ...calc, ...patch },
      ...(patch.formula !== undefined ? { correctAnswer: patch.formula } : {}),
    });
  const values = sampleValues(q, sample);
  const problem = calcFormulaProblem(calc);
  const needsModified = calcModifiedNeedsAnswer(q.modifiedText, calc);
  const modifiedProblem = calcModifiedProblem(calc, q.modifiedText);
  const shown =
    !problem && calc.formula.trim() ? formatCalcAnswer(calc, values) : '';
  const relative = calc.tolerance.kind === 'relative';
  const toleranceValue =
    calc.tolerance.kind === 'relative'
      ? calc.tolerance.percent
      : calc.tolerance.amount;
  return (
    <div>
      <label
        htmlFor="calc-formula"
        className="block font-bold text-emerald-700 text-xs uppercase tracking-wider mb-1"
      >
        Correct Answer
      </label>
      <div className="flex items-center gap-2 min-h-11 px-3 border-2 rounded-lg bg-white border-emerald-500/30 focus-within:border-emerald-500">
        <span className="text-emerald-800 font-bold" aria-hidden>
          =
        </span>
        <input
          id="calc-formula"
          type="text"
          value={calc.formula}
          onChange={(e) => set({ formula: e.target.value })}
          spellCheck={false}
          autoComplete="off"
          placeholder={calc.variables.map((v) => v.name).join(' × ')}
          className="flex-1 min-w-0 bg-transparent text-emerald-800 font-bold text-base focus:outline-hidden placeholder:text-slate-300 placeholder:font-normal"
          {...tourTypeAttr('quiz-editor.calc-formula', 'quiz')}
        />
        {shown && (
          <span className="shrink-0 text-sm text-slate-500">{shown}</span>
        )}
      </div>
      {problem && calc.formula.trim() && (
        <p role="status" className="mt-1 text-xxs font-bold text-amber-700">
          {problem.charAt(0).toUpperCase()}
          {problem.slice(1)}.
        </p>
      )}
      {needsModified && (
        <div className="flex items-center gap-2 mt-2">
          <label
            htmlFor="calc-modified-answer"
            className="shrink-0 text-xs font-bold text-slate-500"
          >
            Modified answer
          </label>
          <input
            id="calc-modified-answer"
            type="text"
            inputMode="decimal"
            value={calc.modifiedAnswer ?? ''}
            maxLength={40}
            autoComplete="off"
            onChange={(e) =>
              set({ modifiedAnswer: e.target.value || undefined })
            }
            className={`${smallInput} max-w-32`}
            {...tourTypeAttr('quiz-editor.calc-modified-answer', 'quiz')}
          />
          {calc.unit && (
            <span className="text-sm text-slate-500">{calc.unit}</span>
          )}
        </div>
      )}
      {needsModified && modifiedProblem && calc.modifiedAnswer?.trim() && (
        <p role="status" className="mt-1 text-xxs font-bold text-amber-700">
          {modifiedProblem.charAt(0).toUpperCase()}
          {modifiedProblem.slice(1)}.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-3 mt-3">
        <div>
          <span className={labelClass}>Accept within</span>
          <div className="flex gap-1.5">
            <span className="w-20 shrink-0">
              <DraftNumberInput
                min={0}
                value={toleranceValue}
                aria-label="Accept within"
                onCommit={(n) =>
                  set({
                    tolerance: relative
                      ? { kind: 'relative', percent: n }
                      : { kind: 'absolute', amount: n },
                  })
                }
                anchor={tourTypeAttr('quiz-editor.calc-tolerance', 'quiz')}
              />
            </span>
            <div
              role="radiogroup"
              aria-label="Accept within as"
              className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm font-bold"
            >
              {(
                [
                  ['relative', '%', 'Percent'],
                  ['absolute', '±', 'Plus or minus'],
                ] as const
              ).map(([kind, label, title]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={calc.tolerance.kind === kind}
                  title={title}
                  onClick={() =>
                    set({
                      tolerance:
                        kind === 'relative'
                          ? { kind, percent: toleranceValue }
                          : { kind, amount: toleranceValue },
                    })
                  }
                  className={`px-2.5 py-1 rounded-md ${
                    calc.tolerance.kind === kind
                      ? 'bg-brand-blue-primary text-white'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  {...tourTypeAttr('quiz-editor.calc-tolerance-kind', 'quiz')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <span className={labelClass}>Round to</span>
          <DraftNumberInput
            integer
            min={0}
            max={CALC_MAX_DECIMALS}
            value={calc.roundTo ?? 2}
            unit="Decimals"
            aria-label="Round to"
            onCommit={(roundTo) => set({ roundTo })}
            anchor={tourTypeAttr('quiz-editor.calc-round', 'quiz')}
          />
        </div>
        <div>
          <label htmlFor="calc-unit" className={labelClass}>
            Unit
          </label>
          <input
            id="calc-unit"
            type="text"
            value={calc.unit ?? ''}
            maxLength={20}
            onChange={(e) => set({ unit: e.target.value || undefined })}
            className={inputClass}
            {...tourTypeAttr('quiz-editor.calc-unit', 'quiz')}
          />
        </div>
      </div>
    </div>
  );
};
