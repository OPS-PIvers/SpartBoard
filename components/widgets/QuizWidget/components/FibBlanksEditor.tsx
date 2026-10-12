import React from 'react';
import { Plus, X } from 'lucide-react';
import type { QuizQuestion } from '@/types';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';
import { tourFieldAttr } from '@/config/tourAnchors';
import { inputClass } from './quizEditorFieldStyles';

type BlankFields = Pick<QuizQuestion, 'correctAnswer' | 'blankAlternates'>;

const answerInputClass =
  'w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-sm';

const MAX_ALTERNATES = 6;

// FIB_BLANK_SEP separates stored blanks, so it can never appear inside one.
const clean = (value: string) => joinBlanks([value]);

/** Multi-blank FIB key: one answer per blank, each with its own also-accept list. */
export const FibBlanksEditor: React.FC<{
  question: BlankFields;
  onChange: (updates: Partial<BlankFields>) => void;
}> = ({ question, onChange }) => {
  const answers = splitBlanks(question.correctAnswer);
  const alternates = answers.map(
    (_, i) => question.blankAlternates?.[i]?.answers ?? []
  );

  const setAnswer = (index: number, value: string) =>
    onChange({
      correctAnswer: joinBlanks(
        answers.map((a, i) => (i === index ? clean(value) : a))
      ),
    });

  const setAlternates = (index: number, next: string[]) => {
    const all = alternates.map((a, i) => ({
      answers: i === index ? next : a,
    }));
    onChange({
      blankAlternates: all.some((b) => b.answers.length > 0) ? all : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <label className="block font-bold text-emerald-700 text-xs uppercase tracking-wider">
        Correct Answers
      </label>
      {answers.map((answer, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-black">
              {i + 1}
            </span>
            <input
              type="text"
              value={answer}
              aria-label={`Blank ${i + 1} answer`}
              placeholder={`Blank ${i + 1}`}
              onChange={(e) => setAnswer(i, e.target.value)}
              {...tourFieldAttr('quiz-editor.fib-blank', 'quiz', String(i + 1))}
              className={answerInputClass}
            />
          </div>
          {alternates[i].map((alt, j) => (
            <div key={j} className="flex items-center gap-2 pl-8">
              <input
                type="text"
                value={alt}
                aria-label={`Blank ${i + 1} also accept ${j + 1}`}
                placeholder="Also accept"
                {...tourFieldAttr(
                  'quiz-editor.fib-alternate',
                  'quiz',
                  `${i + 1}.${j + 1}`
                )}
                onChange={(e) =>
                  setAlternates(
                    i,
                    alternates[i].map((v, k) =>
                      k === j ? clean(e.target.value) : v
                    )
                  )
                }
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  setAlternates(
                    i,
                    alternates[i].filter((_, k) => k !== j)
                  )
                }
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label={`Remove blank ${i + 1} also accept ${j + 1}`}
                {...tourFieldAttr(
                  'quiz-editor.fib-alternate-remove',
                  'quiz',
                  `${i + 1}.${j + 1}`
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {alternates[i].length < MAX_ALTERNATES && (
            <button
              type="button"
              onClick={() => setAlternates(i, [...alternates[i], ''])}
              {...tourFieldAttr(
                'quiz-editor.fib-alternate-add',
                'quiz',
                String(i + 1)
              )}
              className="ml-8 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-brand-blue-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              Also accept
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
