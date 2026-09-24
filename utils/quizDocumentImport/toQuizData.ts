/**
 * Turns what the reader found into a real quiz
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D5, D12).
 *
 * Questions the reader couldn't find an answer for are carried across with
 * `needsKey`, which is what lets the quiz save and open in the editor while
 * Assign stays shut until a teacher fills them in.
 */

import type { QuizData, QuizQuestion } from '@/types';
import {
  multiAnswerPart,
  type ExtractedQuestion,
  type ExtractedQuiz,
} from './types';

function toQuizQuestion(q: ExtractedQuestion): QuizQuestion {
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
    q.warnings.map((w) => `Question ${q.number}: ${w}`)
  );
}

/** Build a quiz from a read document. */
export function extractedToQuizData(
  extracted: ExtractedQuiz,
  options: { title?: string; now?: number } = {}
): QuizData {
  const now = options.now ?? Date.now();
  const questions = extracted.questions.map(toQuizQuestion);

  return {
    id: crypto.randomUUID(),
    title: (options.title ?? extracted.title).trim() || 'Imported Quiz',
    questions,
    createdAt: now,
    updatedAt: now,
  };
}
