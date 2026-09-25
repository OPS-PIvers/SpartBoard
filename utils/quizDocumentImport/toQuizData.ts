/**
 * Turns what the reader found into a real quiz
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D5, D12).
 *
 * Questions the reader couldn't find an answer for are carried across with
 * `needsKey`, which is what lets the quiz save and open in the editor while
 * Assign stays shut until a teacher fills them in.
 */

import type { QuizData, QuizQuestion, QuizStimulus } from '@/types';
import {
  multiAnswerPart,
  type ExtractedQuestion,
  type ExtractedQuiz,
  type SuggestedTarget,
} from './types';

/** An ordering item the key never put in order can't be stored as Ordering, so it is listed. */
function unkeyedOrdering(q: ExtractedQuestion): QuizQuestion {
  const items = q.options.map((o) => `${o.letter}. ${o.text}`).join(' / ');
  return {
    id: crypto.randomUUID(),
    timeLimit: 0,
    text: `${q.text} ${items}`.trim(),
    type: 'free-response',
    correctAnswer: '',
    incorrectAnswers: [],
    ...(q.points !== undefined ? { points: q.points } : {}),
    ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
    ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
  };
}

function toQuizQuestion(q: ExtractedQuestion): QuizQuestion {
  if (q.type === 'Ordering') {
    const order = q.correctAnswer.trim();
    if (!order) return unkeyedOrdering(q);
    return {
      id: crypto.randomUUID(),
      timeLimit: 0,
      text: q.text,
      type: 'Ordering',
      correctAnswer: order,
      incorrectAnswers: [],
      ...(q.points !== undefined ? { points: q.points } : {}),
      ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
      ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
    };
  }
  const isMulti = q.type === 'MA';
  const optionTexts = q.options.map((o) =>
    isMulti ? multiAnswerPart(o.text) : o.text
  );
  const answer = q.correctAnswer.trim();
  const isWritten = q.type === 'free-response';
  const rightSet = new Set(isMulti ? answer.split('|') : [answer]);

  // The answer is one of the options, so the rest are the distractors. With
  // no answer yet, every option stays a distractor and the teacher picks one
  // in the editor — nothing is dropped either way.
  const incorrectAnswers = answer
    ? optionTexts.filter((text) => !rightSet.has(text))
    : optionTexts;

  return {
    id: crypto.randomUUID(),
    timeLimit: 0,
    text: q.text,
    type: q.type,
    correctAnswer: isWritten ? '' : answer,
    incorrectAnswers: isWritten ? [] : incorrectAnswers,
    ...(!isWritten && !answer ? { needsKey: true } : {}),
    ...(q.points !== undefined ? { points: q.points } : {}),
    ...(q.sourceLabel ? { sourceLabel: q.sourceLabel } : {}),
    ...(q.matchingDistractors?.length
      ? { matchingDistractors: [...q.matchingDistractors] }
      : {}),
    ...(q.allowPartialCredit ? { allowPartialCredit: true } : {}),
    // The reader's own image ids. `attachDocumentImages` swaps them for real
    // stimulus ids at save; nothing persists a quiz before that runs.
    ...(q.imageIds.length > 0 ? { stimulusIds: [...q.imageIds] } : {}),
  };
}

/**
 * The per-question notes, numbered so they line up with the review rows.
 * They ride the wizard's own warnings list rather than a parallel channel.
 */
export function rowWarnings(extracted: ExtractedQuiz): string[] {
  return extracted.questions.flatMap((q) =>
    [
      ...q.warnings,
      ...(q.type === 'Ordering' && !q.correctAnswer.trim()
        ? [
            'This looks like an ordering question, but no order was given, so it came in as a written question with the items listed.',
          ]
        : []),
      ...(q.suggestUntick ? [`${q.suggestUntick} It starts unticked.`] : []),
    ].map((w) => `Question ${q.number}: ${w}`)
  );
}

/** What the review table needs beyond the quiz itself, keyed by the quiz it came with. */
export interface ReviewExtras {
  /** Every question read, including rows that start unticked. */
  allQuestions: QuizQuestion[];
  /** Question ids that start unticked (R9), with the reason. */
  untick: ReadonlyMap<string, string>;
  /** Learning-target lines by question id (R20). */
  suggestedTargets: ReadonlyMap<string, SuggestedTarget>;
  /** Standard codes a test bank key listed, by question id (QUIZ_EXAMVIEW_IMPORT E10). */
  standardCodes: ReadonlyMap<string, readonly string[]>;
  /** How the answer key matched, for the review banner (R19). */
  keySummary?: ExtractedQuiz['keySummary'];
}

// By id too: review edits hand back a copy of the quiz with the same id.
const reviewExtras = new Map<string, ReviewExtras>();

/** The review extras for a quiz `extractedToQuizData` built, or an edited copy of it. */
export const reviewExtrasFor = (data: QuizData): ReviewExtras | undefined =>
  reviewExtras.get(data.id);

/**
 * Build a quiz from a read document. Rows the reader suggests unticking are
 * left out of the quiz and kept in `reviewExtrasFor`, so review shows them unticked.
 */
export function extractedToQuizData(
  extracted: ExtractedQuiz,
  options: { title?: string; now?: number } = {}
): QuizData {
  const now = options.now ?? Date.now();
  const stimulusIdByText = new Map<string, string>();
  const stimuli: QuizStimulus[] = (extracted.texts ?? []).map((t) => {
    const id = crypto.randomUUID();
    stimulusIdByText.set(t.id, id);
    return {
      id,
      type: 'text',
      url: '',
      text: t.text,
      label: t.label,
      readAloudSource: 'text',
    };
  });

  const untick = new Map<string, string>();
  const suggestedTargets = new Map<string, SuggestedTarget>();
  const standardCodes = new Map<string, readonly string[]>();
  const allQuestions = extracted.questions.map((q) => {
    const built = toQuizQuestion(q);
    const shared = q.sharedTextId
      ? stimulusIdByText.get(q.sharedTextId)
      : undefined;
    const question = shared
      ? { ...built, stimulusIds: [shared, ...(built.stimulusIds ?? [])] }
      : built;
    if (q.suggestUntick) untick.set(question.id, q.suggestUntick);
    if (q.suggestedTarget) suggestedTargets.set(question.id, q.suggestedTarget);
    if (q.standardCodes?.length)
      standardCodes.set(question.id, q.standardCodes);
    return question;
  });

  const data: QuizData = {
    id: crypto.randomUUID(),
    title: (options.title ?? extracted.title).trim() || 'Imported Quiz',
    questions: allQuestions.filter((q) => !untick.has(q.id)),
    ...(stimuli.length > 0 ? { stimuli } : {}),
    createdAt: now,
    updatedAt: now,
  };
  // A few recent reads are kept, so the map never grows with a long session.
  if (reviewExtras.size >= 8) {
    reviewExtras.delete(reviewExtras.keys().next().value as string);
  }
  reviewExtras.set(data.id, {
    allQuestions,
    untick,
    suggestedTargets,
    standardCodes,
    ...(extracted.keySummary ? { keySummary: extracted.keySummary } : {}),
  });
  return data;
}
