/**
 * QuestionOverlay — active question card shown over the video player.
 *
 * Supports three question types (PR2a):
 *   - MC  : single-select option list (default for legacy / pre-PR2a questions)
 *   - FIB : free-text input; accepts canonical answer + optional variants
 *   - MA  : multi-select checkbox list; submits `selected.sort().join('|')`
 *
 * All correctness checks route through `gradeVideoActivityAnswer` so the
 * three call-sites (this overlay, the post-completion summary, and the
 * teacher Results view) stay in lock-step. Bypassing the shared grader
 * silently breaks gradebook ↔ student-display agreement.
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { VideoActivityQuestion } from '@/types';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';

interface QuestionOverlayProps {
  question: VideoActivityQuestion;
  /** Called with submitted answer + correctness once feedback is shown. */
  onAnswer: (answer: string, isCorrect: boolean) => void;
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

/** Deterministic Fisher–Yates shuffle keyed by the question id. */
function shuffleByQuestionId<T>(arr: T[], questionId: string): T[] {
  const out = [...arr];
  let seed = questionId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const QuestionOverlay: React.FC<QuestionOverlayProps> = ({
  question,
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
  const [submitted, setSubmitted] = useState(false);
  const [submittedIsCorrect, setSubmittedIsCorrect] = useState(false);

  // Correct selections for MA, parsed from the |-encoded correctAnswer.
  const maCorrectSet = useMemo(() => {
    if (type !== 'MA') return new Set<string>();
    return new Set(
      (question.correctAnswer ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    );
  }, [type, question.correctAnswer]);

  // Shuffled option list for MC + MA (FIB has no options).
  const options = useMemo(() => {
    if (type === 'MC') {
      const all = [
        question.correctAnswer,
        ...(question.incorrectAnswers ?? []),
      ];
      return shuffleByQuestionId(all, question.id);
    }
    if (type === 'MA') {
      const all = [...maCorrectSet, ...(question.incorrectAnswers ?? [])];
      // Dedupe in case a malformed save has overlap between the two arrays.
      return shuffleByQuestionId(Array.from(new Set(all)), question.id);
    }
    return [];
  }, [
    type,
    question.id,
    question.correctAnswer,
    question.incorrectAnswers,
    maCorrectSet,
  ]);

  const canSubmit = (() => {
    if (submitted) return false;
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

    const result = gradeVideoActivityAnswer(question, answer);
    setSubmittedIsCorrect(result.isCorrect);
    setSubmitted(true);
    setTimeout(
      () => onAnswer(answer, result.isCorrect),
      result.isCorrect ? 800 : 1200
    );
  };

  const toggleMaOption = (option: string) => {
    setMaSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  };

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
        <p className="text-base font-semibold text-slate-800 leading-snug">
          {question.text}
        </p>
        {type === 'MA' && (
          <p className="text-xs text-slate-500 mt-1">Select all that apply.</p>
        )}
      </div>

      {/* Body — type-specific input */}
      {type === 'MC' && (
        <div className="px-5 pb-5 grid gap-2.5">
          {options.map((option, i) => {
            let style =
              'border-2 border-slate-200 bg-white hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 text-slate-700';
            if (submitted) {
              if (option === question.correctAnswer) {
                style =
                  'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold';
              } else if (
                option === mcSelected &&
                option !== question.correctAnswer
              ) {
                style =
                  'border-2 border-brand-red-primary bg-brand-red-lighter/30 text-brand-red-dark';
              } else {
                style = 'border-2 border-slate-100 bg-slate-50 text-slate-400';
              }
            } else if (mcSelected === option) {
              style =
                'border-2 border-brand-blue-primary bg-brand-blue-lighter/40 text-brand-blue-dark font-semibold';
            }
            return (
              <button
                key={`${i}-${option}`}
                disabled={submitted}
                onClick={() => setMcSelected(option)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${style} flex items-center gap-3`}
              >
                <span className="shrink-0 w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{option}</span>
                {submitted && option === question.correctAnswer && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                {submitted &&
                  option === mcSelected &&
                  option !== question.correctAnswer && (
                    <XCircle className="w-4 h-4 text-brand-red-primary shrink-0" />
                  )}
              </button>
            );
          })}
        </div>
      )}

      {type === 'FIB' && (
        <div className="px-5 pb-5">
          <input
            type="text"
            autoFocus
            disabled={submitted}
            value={fibAnswer}
            onChange={(e) => setFibAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit();
            }}
            placeholder="Type your answer…"
            className={`w-full px-4 py-3 text-sm rounded-xl border-2 transition-all focus:outline-none ${
              submitted
                ? submittedIsCorrect
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold'
                  : 'border-brand-red-primary bg-brand-red-lighter/30 text-brand-red-dark'
                : 'border-slate-200 focus:border-brand-blue-primary text-slate-700'
            }`}
          />
          {submitted && !submittedIsCorrect && (
            <p className="text-xs text-slate-500 mt-2">
              Correct answer:{' '}
              <span className="font-bold text-emerald-700">
                {question.correctAnswer}
              </span>
            </p>
          )}
        </div>
      )}

      {type === 'MA' && (
        <div className="px-5 pb-5 grid gap-2.5">
          {options.map((option, i) => {
            const isChecked = maSelected.has(option);
            const isCorrectOption = maCorrectSet.has(option);
            let style =
              'border-2 border-slate-200 bg-white hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 text-slate-700';
            if (submitted) {
              if (isCorrectOption && isChecked) {
                style =
                  'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold';
              } else if (isCorrectOption && !isChecked) {
                // Missed-correct: highlight subtly so students see what they missed.
                style =
                  'border-2 border-emerald-300 bg-emerald-50/60 text-emerald-700';
              } else if (!isCorrectOption && isChecked) {
                style =
                  'border-2 border-brand-red-primary bg-brand-red-lighter/30 text-brand-red-dark';
              } else {
                style = 'border-2 border-slate-100 bg-slate-50 text-slate-400';
              }
            } else if (isChecked) {
              style =
                'border-2 border-brand-blue-primary bg-brand-blue-lighter/40 text-brand-blue-dark font-semibold';
            }
            return (
              <button
                key={`${i}-${option}`}
                type="button"
                disabled={submitted}
                onClick={() => toggleMaOption(option)}
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
      )}

      {/* Submit button */}
      {!submitted && (
        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-sm transition-all active:scale-95 shadow-sm"
          >
            Submit Answer
          </button>
        </div>
      )}

      {submitted && (
        <div className="px-5 pb-5">
          <div
            className={`text-center text-sm font-bold py-2 rounded-xl ${
              submittedIsCorrect
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-brand-red-lighter/40 text-brand-red-dark'
            }`}
          >
            {submittedIsCorrect
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
