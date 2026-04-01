/**
 * QuestionOverlay — active question card shown over the video player.
 */

import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { VideoActivityQuestion } from '@/types';

interface QuestionOverlayProps {
  question: VideoActivityQuestion;
  /** Called with selected answer + correctness once feedback is shown. */
  onAnswer: (answer: string, isCorrect: boolean) => void;
  /** 1-based index for display */
  questionIndex: number;
  totalQuestions: number;
  requireCorrectAnswer: boolean;
}

export const QuestionOverlay: React.FC<QuestionOverlayProps> = ({
  question,
  onAnswer,
  questionIndex,
  totalQuestions,
  requireCorrectAnswer,
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Build the shuffled options array once (stable order per render)
  const options = React.useMemo(() => {
    const all = [question.correctAnswer, ...question.incorrectAnswers];
    // Fisher–Yates shuffle with a deterministic seed based on question id
    // so options don't re-shuffle on re-render
    const arr = [...all];
    let seed = question.id
      .split('')
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [question]);

  const handleSubmit = () => {
    if (!selected || submitted) return;
    setSubmitted(true);
    const isCorrect = selected === question.correctAnswer;
    // Brief delay so student sees feedback before overlay closes
    setTimeout(() => onAnswer(selected, isCorrect), isCorrect ? 800 : 1200);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
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
      </div>

      {/* Options */}
      <div className="px-5 pb-5 grid gap-2.5">
        {options.map((option, i) => {
          let style =
            'border-2 border-slate-200 bg-white hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 text-slate-700';

          if (submitted) {
            if (option === question.correctAnswer) {
              style =
                'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold';
            } else if (
              option === selected &&
              option !== question.correctAnswer
            ) {
              style =
                'border-2 border-brand-red-primary bg-brand-red-lighter/30 text-brand-red-dark';
            } else {
              style = 'border-2 border-slate-100 bg-slate-50 text-slate-400';
            }
          } else if (selected === option) {
            style =
              'border-2 border-brand-blue-primary bg-brand-blue-lighter/40 text-brand-blue-dark font-semibold';
          }

          return (
            <button
              key={`${i}-${option}`}
              disabled={submitted}
              onClick={() => setSelected(option)}
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
                option === selected &&
                option !== question.correctAnswer && (
                  <XCircle className="w-4 h-4 text-brand-red-primary shrink-0" />
                )}
            </button>
          );
        })}
      </div>

      {/* Submit */}
      {!submitted && (
        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={!selected}
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
              selected === question.correctAnswer
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-brand-red-lighter/40 text-brand-red-dark'
            }`}
          >
            {selected === question.correctAnswer
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
