/**
 * QuestionOverlay — active question card shown over the video player.
 *
 * Supports three question types (PR2a):
 *   - MC  : single-select option list (default for legacy / pre-PR2a questions)
 *   - FIB : free-text input; accepts canonical answer + optional variants
 *   - MA  : multi-select checkbox list; submits `selected.sort().join('|')`
 *
 * The question carries no answer key: `checkAnswer` grades server-side with
 * the same rules as `gradeVideoActivityAnswer`, which the teacher Results
 * view uses, so student feedback and the gradebook stay in lock-step.
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { logError } from '@/utils/logError';
import type {
  VideoActivityCheckResult,
  VideoActivityPublicQuestion,
} from '@/types';
import { questionOptions } from '@/utils/videoActivityOptions';

interface QuestionOverlayProps {
  question: VideoActivityPublicQuestion;
  /** Server grading; rejects when the check can't reach the server. */
  checkAnswer: (answer: string) => Promise<VideoActivityCheckResult>;
  /** Called once feedback is shown; `graded` is false when the check couldn't reach the server. */
  onAnswer: (answer: string, isCorrect: boolean, graded: boolean) => void;
  /** 1-based index for display */
  questionIndex: number;
  totalQuestions: number;
  requireCorrectAnswer: boolean;
}

const formatTimestamp = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface McOptionListProps {
  options: string[];
  selected: string | null;
  onSelect: (option: string) => void;
  locked: boolean;
  /** Non-null once graded: marks the key and a wrong pick. */
  correctAnswer: string | null;
}

export const McOptionList: React.FC<McOptionListProps> = ({
  options,
  selected,
  onSelect,
  locked,
  correctAnswer,
}) => {
  const graded = correctAnswer !== null;
  return (
    <div className="px-5 pb-5 grid gap-2.5">
      {options.map((option, i) => {
        let style =
          'border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-700';
        if (graded) {
          if (option === correctAnswer) {
            style =
              'border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-bold';
          } else if (option === selected) {
            style = 'border-2 border-red-200 bg-red-50 text-red-700';
          } else {
            style = 'border-2 border-slate-100 bg-slate-50 text-slate-400';
          }
        } else if (selected === option) {
          style =
            'border-2 border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary font-semibold';
        }
        return (
          <button
            key={`${i}-${option}`}
            disabled={locked}
            onClick={() => onSelect(option)}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${style} flex items-center gap-3`}
          >
            <span className="shrink-0 w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1">{option}</span>
            {graded && option === correctAnswer && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            {graded && option === selected && option !== correctAnswer && (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
};

interface FibAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter key; the caller decides whether a submit is allowed. */
  onEnter: () => void;
  locked: boolean;
  graded: boolean;
  isCorrect: boolean;
  /** Shown under a wrong graded answer when known. */
  correctAnswer: string | null;
}

export const FibAnswerInput: React.FC<FibAnswerInputProps> = ({
  value,
  onChange,
  onEnter,
  locked,
  graded,
  isCorrect,
  correctAnswer,
}) => (
  <div className="px-5 pb-5">
    <input
      type="text"
      autoFocus
      disabled={locked}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter();
      }}
      placeholder="Type your answer…"
      className={`w-full px-4 py-3 text-sm rounded-xl border-2 transition-all focus:outline-none ${
        graded
          ? isCorrect
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 font-bold'
            : 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-300 focus:border-brand-blue-light focus:ring-2 focus:ring-brand-blue-light text-slate-900 placeholder-slate-400'
      }`}
    />
    {graded && !isCorrect && correctAnswer !== null && (
      <p className="text-xs text-slate-500 mt-2">
        Correct answer:{' '}
        <span className="font-bold text-emerald-700">{correctAnswer}</span>
      </p>
    )}
  </div>
);

interface MaOptionListProps {
  options: string[];
  selected: Set<string>;
  onToggle: (option: string) => void;
  locked: boolean;
  /** Non-null once graded: the |-encoded key. */
  correctAnswer: string | null;
}

export const MaOptionList: React.FC<MaOptionListProps> = ({
  options,
  selected,
  onToggle,
  locked,
  correctAnswer,
}) => {
  const graded = correctAnswer !== null;
  // Correct selections for MA, parsed from the |-encoded key the server returns.
  const correctSet = useMemo(
    () =>
      new Set(
        (correctAnswer ?? '')
          .split('|')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      ),
    [correctAnswer]
  );
  return (
    <div className="px-5 pb-5 grid gap-2.5">
      {options.map((option, i) => {
        const isChecked = selected.has(option);
        const isCorrectOption = correctSet.has(option);
        let style =
          'border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-700';
        if (graded) {
          if (isCorrectOption && isChecked) {
            style =
              'border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-bold';
          } else if (isCorrectOption && !isChecked) {
            // Missed-correct: highlight subtly so students see what they missed.
            style =
              'border-2 border-emerald-200 bg-emerald-50/60 text-emerald-700';
          } else if (!isCorrectOption && isChecked) {
            style = 'border-2 border-red-200 bg-red-50 text-red-700';
          } else {
            style = 'border-2 border-slate-100 bg-slate-50 text-slate-400';
          }
        } else if (isChecked) {
          style =
            'border-2 border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary font-semibold';
        }
        return (
          <button
            key={`${i}-${option}`}
            type="button"
            disabled={locked}
            onClick={() => onToggle(option)}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${style} flex items-center gap-3`}
          >
            <span
              className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs font-bold ${
                isChecked
                  ? 'bg-current text-white'
                  : 'border-current bg-transparent'
              }`}
            >
              {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
            </span>
            <span className="flex-1">{option}</span>
          </button>
        );
      })}
    </div>
  );
};

export const QuestionOverlay: React.FC<QuestionOverlayProps> = ({
  question,
  checkAnswer,
  onAnswer,
  questionIndex,
  totalQuestions,
  requireCorrectAnswer,
}) => {
  const type = question.type ?? 'MC';

  // ── MC state: single-selected option ───────────────────────────────────────
  const [mcSelected, setMcSelected] = useState<string | null>(null);
  // ── FIB state: free-text answer ────────────────────────────────────────────
  const [fibAnswer, setFibAnswer] = useState('');
  // ── MA state: set of selected options ──────────────────────────────────────
  const [maSelected, setMaSelected] = useState<Set<string>>(new Set());

  // Submission lifecycle is shared across types.
  const [checking, setChecking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedIsCorrect, setSubmittedIsCorrect] = useState(false);
  // Null when the check failed: the answer is kept without feedback.
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const graded = submitted && correctAnswer !== null;

  // Shuffled option list for MC + MA (FIB has no options).
  const options = useMemo(() => questionOptions(question), [question]);

  const canSubmit = (() => {
    if (submitted || checking) return false;
    if (type === 'MC') return mcSelected !== null;
    if (type === 'FIB') return fibAnswer.trim().length > 0;
    if (type === 'MA') return maSelected.size > 0;
    return false;
  })();

  const handleSubmit = () => {
    if (!canSubmit) return;
    let answer = '';
    if (type === 'MC') answer = mcSelected ?? '';
    else if (type === 'FIB') answer = fibAnswer.trim();
    else if (type === 'MA') answer = Array.from(maSelected).sort().join('|');

    setChecking(true);
    void checkAnswer(answer)
      .then(
        (result) => ({
          isCorrect: result.isCorrect,
          key: result.correctAnswer as string | null,
        }),
        // Any failed check (network or server refusal) must not strand the class: keep the answer, skip feedback.
        (err: unknown) => {
          logError('QuestionOverlay.checkAnswer', err, {
            questionId: question.id,
          });
          return { isCorrect: true, key: null };
        }
      )
      .then(({ isCorrect, key }) => {
        setChecking(false);
        setCorrectAnswer(key);
        setSubmittedIsCorrect(isCorrect);
        setSubmitted(true);
        setTimeout(
          () => onAnswer(answer, isCorrect, key !== null),
          isCorrect ? 800 : 1200
        );
      });
  };

  const toggleMaOption = (option: string) => {
    setMaSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  };

  const locked = submitted || checking;

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-slate-200 shadow-2xl overflow-hidden bg-white max-h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-brand-blue-primary rounded-t-2xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Clock className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">
            {formatTimestamp(question.timestamp)}
          </span>
        </div>
        <span className="text-white/60 text-xs font-medium">
          Question {questionIndex} of {totalQuestions}
        </span>
      </div>

      {/* Question */}
      <div className="px-5 pt-5 pb-3">
        <p className="text-base font-semibold text-slate-900 leading-snug">
          {question.text}
        </p>
        {type === 'MA' && (
          <p className="text-xs text-slate-500 mt-1">Select all that apply.</p>
        )}
      </div>

      {/* Body — type-specific input */}
      {type === 'MC' && (
        <McOptionList
          options={options}
          selected={mcSelected}
          onSelect={setMcSelected}
          locked={locked}
          correctAnswer={graded ? correctAnswer : null}
        />
      )}

      {type === 'FIB' && (
        <FibAnswerInput
          value={fibAnswer}
          onChange={setFibAnswer}
          onEnter={() => {
            if (canSubmit) handleSubmit();
          }}
          locked={locked}
          graded={graded}
          isCorrect={submittedIsCorrect}
          correctAnswer={correctAnswer}
        />
      )}

      {type === 'MA' && (
        <MaOptionList
          options={options}
          selected={maSelected}
          onToggle={toggleMaOption}
          locked={locked}
          correctAnswer={graded ? correctAnswer : null}
        />
      )}

      {/* Submit button */}
      {!submitted && (
        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={checking}
            className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-sm transition-all active:scale-95 shadow-sm"
          >
            {checking ? 'Checking…' : 'Submit Answer'}
          </button>
        </div>
      )}

      {submitted && (
        <div className="px-5 pb-5">
          <div
            className={`text-center text-sm font-bold py-2 rounded-xl border ${
              !graded
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : submittedIsCorrect
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {!graded
              ? 'Answer saved. Resuming video…'
              : submittedIsCorrect
                ? '✓ Correct! Resuming video…'
                : requireCorrectAnswer
                  ? '✗ Incorrect. Rewinding section…'
                  : '✗ Incorrect. Resuming video…'}
          </div>
        </div>
      )}
    </div>
  );
};
