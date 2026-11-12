// Blank type for fill in the blank: the Typed / Dropdown / Drag select, dropdown choices and the drag word bank (docs/plans/QUIZ_MCA_PRACTICE.md M6–M9).
import React from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { FibBlankType, QuizQuestion } from '@/types';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';
import {
  blankTypeOf,
  blankTypeProblem,
  blankTypeUpdate,
} from '@/utils/quizBlankTypes';
import { inputClass, labelClass } from './quizEditorFieldStyles';

type Update = (updates: Partial<QuizQuestion>) => void;

const MAX_CHOICES = 8;
const MAX_WORDS = 20;

// The blank separator can never sit inside a stored word.
const clean = (value: string) => joinBlanks([value]);

const move = (items: string[], from: number, to: number): string[] => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const BlankBadge: React.FC<{ n: number }> = ({ n }) => (
  <span className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-black">
    {n}
  </span>
);

/** "Blank type" select; shown with the flag, or read-only when a question already has a type. */
export const FibBlankTypeSelect: React.FC<{
  question: QuizQuestion;
  onChange: Update;
  disabled?: boolean;
}> = ({ question: q, onChange, disabled = false }) => (
  <div className="flex items-center gap-3">
    <label
      htmlFor={`blank-type-${q.id}`}
      className={labelClass.replace('mb-1', 'mb-0')}
    >
      Blank type
    </label>
    <select
      id={`blank-type-${q.id}`}
      value={blankTypeOf(q)}
      disabled={disabled}
      onChange={(e) =>
        onChange(blankTypeUpdate(q, e.target.value as FibBlankType))
      }
      {...tourTypeAttr('quiz-editor.fib-blank-type', 'quiz')}
      className={`${inputClass} appearance-none max-w-[180px]`}
    >
      <option value="typed">Typed</option>
      <option value="dropdown">Dropdown</option>
      <option value="drag">Drag</option>
    </select>
  </div>
);

/** Amber line naming what still stops a dropdown or drag question from grading. */
export const BlankTypeNotice: React.FC<{ question: QuizQuestion }> = ({
  question,
}) => {
  const problem = blankTypeProblem(question);
  if (!problem) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-1 text-xxs font-bold text-amber-700"
    >
      <AlertCircle className="w-3 h-3" aria-hidden />
      {problem.charAt(0).toUpperCase() + problem.slice(1)}.
    </p>
  );
};

/** Dropdown key: each blank's choices in the order students see them, with the right one picked. */
export const FibDropdownEditor: React.FC<{
  question: QuizQuestion;
  onChange: Update;
}> = ({ question: q, onChange }) => {
  const answers = splitBlanks(q.correctAnswer);
  const lists = answers.map((_, i) => q.blankChoices?.[i]?.choices ?? []);
  const many = answers.length > 1;

  const write = (blank: number, choices: string[], answer: string) =>
    onChange({
      blankChoices: lists.map((l, i) => ({
        choices: i === blank ? choices : l,
      })),
      correctAnswer: joinBlanks(
        answers.map((a, i) => (i === blank ? answer : a))
      ),
    });

  const isRight = (blank: number, choice: string) =>
    choice.trim() !== '' &&
    choice.trim().toLowerCase() === answers[blank].trim().toLowerCase();

  return (
    <div className="space-y-3">
      <label className="block font-bold text-emerald-700 text-xs uppercase tracking-wider">
        {many ? 'Choices for each blank' : 'Choices'}
      </label>
      {lists.map((choices, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2"
          role="radiogroup"
          aria-label={many ? `Blank ${i + 1} choices` : 'Choices'}
        >
          {many && (
            <div className="flex items-center gap-2">
              <BlankBadge n={i + 1} />
              <span className="text-xs font-bold text-slate-600">
                Blank {i + 1}
              </span>
            </div>
          )}
          {choices.map((choice, j) => (
            <div key={j} className="flex items-center gap-2">
              <input
                type="radio"
                name={`fib-choice-${q.id}-${i}`}
                checked={isRight(i, choice)}
                disabled={!choice.trim()}
                onChange={() => write(i, choices, choice.trim())}
                aria-label={`Choice ${j + 1} is correct`}
                title="The right choice"
                {...tourFieldAttr(
                  'quiz-editor.fib-choice-correct',
                  'quiz',
                  `${i + 1}.${j + 1}`
                )}
                className="w-4 h-4 accent-emerald-600 shrink-0"
              />
              <input
                type="text"
                value={choice}
                aria-label={`${many ? `Blank ${i + 1} choice` : 'Choice'} ${j + 1}`}
                placeholder={`Choice ${j + 1}`}
                onChange={(e) => {
                  const next = clean(e.target.value);
                  const updated = choices.map((c, k) => (k === j ? next : c));
                  write(
                    i,
                    updated,
                    isRight(i, choice) ? next.trim() : answers[i]
                  );
                }}
                {...tourFieldAttr(
                  'quiz-editor.fib-choice',
                  'quiz',
                  `${i + 1}.${j + 1}`
                )}
                className={`${inputClass} ${isRight(i, choice) ? 'border-emerald-500/60 text-emerald-800 font-bold' : ''}`}
              />
              <button
                // no-tour-anchor: reorder arrow; tours point at the choice itself
                type="button"
                disabled={j === 0}
                onClick={() => write(i, move(choices, j, j - 1), answers[i])}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-lg"
                aria-label={`Move choice ${j + 1} up`}
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                // no-tour-anchor: reorder arrow; tours point at the choice itself
                type="button"
                disabled={j === choices.length - 1}
                onClick={() => write(i, move(choices, j, j + 1), answers[i])}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded-lg"
                aria-label={`Move choice ${j + 1} down`}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  write(
                    i,
                    choices.filter((_, k) => k !== j),
                    isRight(i, choice) ? '' : answers[i]
                  )
                }
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label={`Remove choice ${j + 1}`}
                {...tourFieldAttr(
                  'quiz-editor.fib-choice-remove',
                  'quiz',
                  `${i + 1}.${j + 1}`
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {choices.length < MAX_CHOICES && (
            <button
              type="button"
              onClick={() => write(i, [...choices, ''], answers[i])}
              {...tourFieldAttr(
                'quiz-editor.fib-choice-add',
                'quiz',
                String(i + 1)
              )}
              className="ml-6 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-brand-blue-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              Add choice
            </button>
          )}
        </div>
      ))}
      <p className="text-xxs text-slate-500">
        Students see the choices in this order.
      </p>
      <BlankTypeNotice question={q} />
    </div>
  );
};

/** Drag word bank: every word students can drag, answers included, plus the reuse switch. */
export const FibWordBankEditor: React.FC<{
  question: QuizQuestion;
  onChange: Update;
}> = ({ question: q, onChange }) => {
  const words = q.wordBank ?? [];
  const setWords = (next: string[]) => onChange({ wordBank: next });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block font-bold text-emerald-700 text-xs uppercase tracking-wider">
          Word bank
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={q.wordBankReuse === true}
            onChange={(e) =>
              onChange({ wordBankReuse: e.target.checked ? true : undefined })
            }
            {...tourTypeAttr('quiz-editor.word-bank-reuse', 'quiz')}
            className="w-4 h-4 accent-brand-blue-primary"
          />
          <span className="font-bold text-xs text-slate-700">
            Words can be used more than once
          </span>
        </label>
      </div>
      {words.map((word, j) => (
        <div key={j} className="flex items-center gap-2">
          <input
            type="text"
            value={word}
            aria-label={`Word ${j + 1}`}
            placeholder={`Word ${j + 1}`}
            onChange={(e) =>
              setWords(
                words.map((w, k) => (k === j ? clean(e.target.value) : w))
              )
            }
            {...tourFieldAttr(
              'quiz-editor.word-bank-word',
              'quiz',
              String(j + 1)
            )}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setWords(words.filter((_, k) => k !== j))}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            aria-label={`Remove word ${j + 1}`}
            {...tourFieldAttr(
              'quiz-editor.word-bank-remove',
              'quiz',
              String(j + 1)
            )}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      {words.length < MAX_WORDS && (
        <button
          type="button"
          onClick={() => setWords([...words, ''])}
          {...tourTypeAttr('quiz-editor.word-bank-add', 'quiz')}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-brand-blue-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          Add word
        </button>
      )}
      <BlankTypeNotice question={q} />
    </div>
  );
};
