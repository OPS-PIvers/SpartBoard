/**
 * The review table shown after a test document is read
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D10).
 *
 * A reader is never certain, so nothing is created until the teacher has seen
 * what it made of their test. Every row can be unticked, its text corrected,
 * and its answer set from the choices the document listed — which is the
 * quick way to clear a "Needs answer" before the quiz is even created.
 */

import React, { useState } from 'react';
import { AlertCircle, FileWarning } from 'lucide-react';
import type { QuizData, QuizQuestion, QuizQuestionType } from '@/types';
import { questionNeedsKey } from '@/utils/quizNeedsKey';

interface Props {
  data: QuizData;
  onChange: (next: QuizData) => void;
}

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  MC: 'Multiple choice',
  FIB: 'Fill in the blank',
  Matching: 'Matching',
  Ordering: 'Ordering',
  'free-response': 'Written response',
};

/** Every choice the document listed, answer first so the order is stable. */
const choicesOf = (q: QuizQuestion): string[] =>
  q.correctAnswer.trim()
    ? [q.correctAnswer, ...q.incorrectAnswers]
    : q.incorrectAnswers;

export const QuizDocumentReview: React.FC<Props> = ({ data, onChange }) => {
  // The full set read from the document. Unticking removes a question from
  // what gets created, so the master list has to outlive that or a row could
  // never be ticked back on. The preview step mounts once per read.
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>(
    data.questions
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  // The choice order is fixed when the read lands. Deriving it from the
  // current answer would reshuffle the radio list under the teacher's cursor
  // the moment they pick a different one.
  const [choiceOrder] = useState<ReadonlyMap<string, string[]>>(
    () => new Map(data.questions.map((q) => [q.id, choicesOf(q)]))
  );

  const emit = (
    nextExcluded: ReadonlySet<string>,
    questions = allQuestions
  ) => {
    onChange({
      ...data,
      questions: questions.filter((q) => !nextExcluded.has(q.id)),
    });
  };

  const updateQuestion = (
    id: string,
    change: (q: QuizQuestion) => QuizQuestion
  ): void => {
    const next = allQuestions.map((q) => (q.id === id ? change(q) : q));
    setAllQuestions(next);
    emit(excluded, next);
  };

  const toggle = (id: string, include: boolean): void => {
    const next = new Set(excluded);
    if (include) next.delete(id);
    else next.add(id);
    setExcluded(next);
    emit(next);
  };

  if (allQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <FileWarning className="h-8 w-8 text-amber-500" aria-hidden />
        <p className="text-sm font-bold text-slate-700">
          No questions could be read from this document.
        </p>
        <p className="max-w-sm text-xs text-slate-500">
          The reader looks for numbered questions like &ldquo;1.&rdquo; with
          lettered choices under them. Check that the document uses that layout,
          or go back and try a different file.
        </p>
      </div>
    );
  }

  const includedCount = allQuestions.length - excluded.size;
  const needingKey = allQuestions.filter(
    (q) => !excluded.has(q.id) && questionNeedsKey(q)
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">
          {includedCount} of {allQuestions.length}{' '}
          {allQuestions.length === 1 ? 'question' : 'questions'} will be created
        </p>
        {needingKey > 0 && (
          <p className="flex items-center gap-1 text-xs font-bold text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            {needingKey} still {needingKey === 1 ? 'needs' : 'need'} an answer
          </p>
        )}
      </div>

      <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
        {allQuestions.map((q, index) => {
          const included = !excluded.has(q.id);
          const choices = choiceOrder.get(q.id) ?? choicesOf(q);
          return (
            <li
              key={q.id}
              className={`rounded-xl border p-2.5 transition-colors ${
                included
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-200 bg-slate-50 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(e) => toggle(q.id, e.target.checked)}
                  className="mt-1 shrink-0 accent-brand-blue-primary"
                  aria-label={`Create question ${index + 1}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      {index + 1}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-slate-600">
                      {TYPE_LABEL[q.type]}
                    </span>
                    {questionNeedsKey(q) && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-amber-800">
                        Needs answer
                      </span>
                    )}
                  </div>

                  <textarea
                    value={q.text}
                    onChange={(e) =>
                      updateQuestion(q.id, (prev) => ({
                        ...prev,
                        text: e.target.value,
                      }))
                    }
                    rows={2}
                    aria-label={`Question ${index + 1} text`}
                    className="w-full resize-y rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none"
                  />

                  {choices.length > 0 && (
                    <fieldset className="space-y-1">
                      <legend className="text-xxs font-bold uppercase tracking-wider text-slate-500">
                        Correct answer
                      </legend>
                      {choices.map((choice, choiceIndex) => (
                        <label
                          key={`${q.id}-${choiceIndex}`}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="radio"
                            name={`answer-${q.id}`}
                            checked={q.correctAnswer === choice}
                            onChange={() =>
                              updateQuestion(q.id, (prev) => {
                                const all =
                                  choiceOrder.get(q.id) ?? choicesOf(prev);
                                return {
                                  ...prev,
                                  correctAnswer: choice,
                                  incorrectAnswers: all.filter(
                                    (c) => c !== choice
                                  ),
                                  // Answering it here clears the flag, so the
                                  // quiz can be assigned without a second pass.
                                  needsKey: false,
                                };
                              })
                            }
                            className="shrink-0 accent-brand-blue-primary"
                            aria-label={`Question ${index + 1}, answer: ${choice}`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {choice}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
