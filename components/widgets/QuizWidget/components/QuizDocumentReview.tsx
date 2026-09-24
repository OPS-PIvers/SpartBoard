/**
 * The review table shown after a test document is read
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D10).
 *
 * A reader is never certain, so nothing is created until the teacher has seen
 * what it made of their test. Every row can be unticked, its text corrected,
 * and its answer set from the choices the document listed — which is the
 * quick way to clear a "Needs answer" before the quiz is even created.
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle, FileWarning, X } from 'lucide-react';
import type {
  QuestionTargetTag,
  QuizData,
  QuizQuestion,
  QuizQuestionType,
} from '@/types';
import type { ExtractedImage } from '@/utils/quizDocumentImport';
import { questionNeedsKey } from '@/utils/quizNeedsKey';
import {
  multiAnswerCorrectOptions,
  multiAnswerOptions,
} from '@/utils/quizMultiAnswer';
import { withTargetTag } from '@/utils/quizDocumentImport/suggestedTargets';
import {
  spillMessage,
  spillWarnings,
  type SpillWarning,
} from '@/utils/quizDocumentImport/spillWarnings';
import type { SuggestedTarget } from '@/utils/quizDocumentImport/suggestedTargets';
import {
  WithSuggestedTargets,
  type SuggestedTargetsSlots,
} from './QuizImportSuggestedTargets';

interface Props {
  data: QuizData;
  onChange: (next: QuizData) => void;
  /**
   * The pictures the document carried (D14). The reader proposes which
   * questions use each one; the teacher corrects that here, before anything
   * is uploaded.
   */
  images?: readonly ExtractedImage[];
  /** Target lines the reader found, by question id; pass only when the suggested-targets flag is on. */
  suggestedTargets?: ReadonlyMap<string, SuggestedTarget>;
}

const TYPE_LABEL: Record<QuizQuestionType, string> = {
  MC: 'Multiple choice',
  FIB: 'Fill in the blank',
  Matching: 'Matching',
  Ordering: 'Ordering',
  MA: 'Choose all that apply',
  'free-response': 'Written response',
};

/** Every choice the document listed, answer first so the order is stable. */
const choicesOf = (q: QuizQuestion): string[] => {
  if (q.type === 'MA') return multiAnswerOptions(q);
  return q.correctAnswer.trim()
    ? [q.correctAnswer, ...q.incorrectAnswers]
    : q.incorrectAnswers;
};

const SpillNote: React.FC<{ warning?: SpillWarning }> = ({ warning }) =>
  warning ? (
    <span className="flex shrink-0 items-center gap-1 text-xxs font-bold text-amber-800">
      <AlertCircle className="h-3 w-3" aria-hidden />
      {spillMessage(warning)}
    </span>
  ) : null;

const ReviewTable: React.FC<
  Omit<Props, 'suggestedTargets'> & { targetSlots?: SuggestedTargetsSlots }
> = ({ data, onChange, images = [], targetSlots }) => {
  // The full set read from the document. Unticking removes a question from
  // what gets created, so the master list has to outlive that or a row could
  // never be ticked back on. The preview step mounts once per read.
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>(
    data.questions
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // The choice order is fixed when the read lands. Deriving it from the
  // current answer would reshuffle the radio list under the teacher's cursor
  // the moment they pick a different one.
  const [choiceOrder] = useState<ReadonlyMap<string, string[]>>(
    () => new Map(data.questions.map((q) => [q.id, choicesOf(q)]))
  );
  // An object URL is a browser resource, not derived state: made once for
  // the thumbnails and released when the review step goes away.
  const [previews] = useState<ReadonlyMap<string, string>>(
    () => new Map(images.map((img) => [img.id, URL.createObjectURL(img.blob)]))
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews]
  );

  /** "Picture 2" reads better on a row than `figure-page-3.png` does. */
  const pictureLabel = (id: string): string =>
    `Picture ${images.findIndex((img) => img.id === id) + 1}`;

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

  /**
   * The other rows using this picture, by the number shown on the row. One
   * upload serves them all (D14), so a teacher moving it off this question
   * needs to see where else it lands.
   */
  const sharedWith = (imageId: string, questionId: string): number[] =>
    allQuestions
      .map((q, i) => ({ q, number: i + 1 }))
      .filter(
        ({ q }) => q.id !== questionId && q.stimulusIds?.includes(imageId)
      )
      .map(({ number }) => number);

  const linkPicture = (questionId: string, imageId: string): void =>
    updateQuestion(questionId, (prev) =>
      prev.stimulusIds?.includes(imageId)
        ? prev
        : { ...prev, stimulusIds: [...(prev.stimulusIds ?? []), imageId] }
    );

  const unlinkPicture = (questionId: string, imageId: string): void =>
    updateQuestion(questionId, (prev) => ({
      ...prev,
      stimulusIds: (prev.stimulusIds ?? []).filter((id) => id !== imageId),
    }));

  const applyTargets = (tags: ReadonlyMap<string, QuestionTargetTag>): void => {
    const next = allQuestions.map((q) => {
      const tag = tags.get(q.id);
      return tag ? { ...q, targets: withTargetTag(q.targets, tag) } : q;
    });
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
  const spills = new Map<string, SpillWarning[]>(
    allQuestions.map((q) => [
      q.id,
      spillWarnings(q.text, choiceOrder.get(q.id) ?? choicesOf(q)),
    ])
  );
  const isFlagged = (q: QuizQuestion): boolean =>
    questionNeedsKey(q) || (spills.get(q.id)?.length ?? 0) > 0;
  const flaggedCount = allQuestions.filter(isFlagged).length;
  const showOnlyFlagged = onlyFlagged && flaggedCount > 0;

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

      {flaggedCount > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
            className="accent-brand-blue-primary"
          />
          Show only flagged rows ({flaggedCount})
        </label>
      )}

      {targetSlots?.header(allQuestions, applyTargets)}

      <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
        {allQuestions.map((q, index) => {
          if (showOnlyFlagged && !isFlagged(q)) return null;
          const included = !excluded.has(q.id);
          const rowSpills = spills.get(q.id) ?? [];
          const choiceSpill = (i: number): SpillWarning | undefined =>
            rowSpills.find((w) => w.at === i);
          const stemSpill = rowSpills.find((w) => w.at === 'stem');
          const choices = choiceOrder.get(q.id) ?? choicesOf(q);
          // Only ids the document actually carried; a stimulus added some
          // other way has no thumbnail to show here.
          const linked = (q.stimulusIds ?? []).filter((id) => previews.has(id));
          const unlinked = images
            .map((img) => img.id)
            .filter((id) => !linked.includes(id));
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
                    {rowSpills.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-amber-800">
                        <AlertCircle className="h-3 w-3" aria-hidden />
                        Check text
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
                  {stemSpill && <SpillNote warning={stemSpill} />}

                  {targetSlots?.row(q, index + 1, (tag) =>
                    applyTargets(new Map([[q.id, tag]]))
                  )}

                  {choices.length > 0 && q.type === 'MA' && (
                    <fieldset className="space-y-1">
                      <legend className="text-xxs font-bold uppercase tracking-wider text-slate-500">
                        Correct answers
                      </legend>
                      {choices.map((choice, choiceIndex) => {
                        const right = multiAnswerCorrectOptions(
                          q.correctAnswer
                        );
                        return (
                          <label
                            key={`${q.id}-${choiceIndex}`}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={right.includes(choice)}
                              onChange={(e) =>
                                updateQuestion(q.id, (prev) => {
                                  const all =
                                    choiceOrder.get(q.id) ?? choicesOf(prev);
                                  const picked = new Set(
                                    multiAnswerCorrectOptions(
                                      prev.correctAnswer
                                    )
                                  );
                                  if (e.target.checked) picked.add(choice);
                                  else picked.delete(choice);
                                  return {
                                    ...prev,
                                    correctAnswer: all
                                      .filter((c) => picked.has(c))
                                      .join('|'),
                                    incorrectAnswers: all.filter(
                                      (c) => !picked.has(c)
                                    ),
                                    needsKey: picked.size === 0,
                                  };
                                })
                              }
                              className="shrink-0 accent-brand-blue-primary"
                              aria-label={`Question ${index + 1}, correct answer: ${choice}`}
                            />
                            <span
                              className={`min-w-0 flex-1 ${choiceSpill(choiceIndex) ? 'break-words' : 'truncate'}`}
                            >
                              {choice}
                            </span>
                            {choiceSpill(choiceIndex) && (
                              <SpillNote warning={choiceSpill(choiceIndex)} />
                            )}
                          </label>
                        );
                      })}
                    </fieldset>
                  )}

                  {choices.length > 0 && q.type !== 'MA' && (
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
                          <span
                            className={`min-w-0 flex-1 ${choiceSpill(choiceIndex) ? 'break-words' : 'truncate'}`}
                          >
                            {choice}
                          </span>
                          {choiceSpill(choiceIndex) && (
                            <SpillNote warning={choiceSpill(choiceIndex)} />
                          )}
                        </label>
                      ))}
                    </fieldset>
                  )}

                  {images.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xxs font-bold uppercase tracking-wider text-slate-500">
                        Pictures
                      </p>
                      <div className="flex flex-wrap items-start gap-2">
                        {linked.map((imageId) => {
                          const alsoOn = sharedWith(imageId, q.id);
                          return (
                            <div key={imageId} className="w-24">
                              <div className="relative">
                                <img
                                  src={previews.get(imageId)}
                                  alt={`${pictureLabel(imageId)} on question ${index + 1}`}
                                  className="h-16 w-24 rounded-lg border border-slate-200 object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() => unlinkPicture(q.id, imageId)}
                                  aria-label={`Remove ${pictureLabel(imageId)} from question ${index + 1}`}
                                  className="absolute -right-1.5 -top-1.5 rounded-full border border-slate-300 bg-white p-0.5 text-slate-600 hover:bg-slate-100"
                                >
                                  <X className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                              <p className="mt-0.5 truncate text-xxs text-slate-500">
                                {alsoOn.length > 0
                                  ? `Also on ${alsoOn.join(', ')}`
                                  : pictureLabel(imageId)}
                              </p>
                            </div>
                          );
                        })}

                        {unlinked.length > 0 && (
                          <label className="text-xs text-slate-600">
                            <span className="sr-only">
                              Add a picture to question {index + 1}
                            </span>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value)
                                  linkPicture(q.id, e.target.value);
                              }}
                              className="h-16 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 focus:border-brand-blue-primary focus:outline-none"
                            >
                              <option value="">Add a picture…</option>
                              {unlinked.map((imageId) => (
                                <option key={imageId} value={imageId}>
                                  {pictureLabel(imageId)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
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

export const QuizDocumentReview: React.FC<Props> = ({
  suggestedTargets,
  ...props
}) =>
  suggestedTargets && suggestedTargets.size > 0 ? (
    <WithSuggestedTargets suggestions={suggestedTargets}>
      {(slots) => <ReviewTable {...props} targetSlots={slots} />}
    </WithSuggestedTargets>
  ) : (
    <ReviewTable {...props} />
  );
