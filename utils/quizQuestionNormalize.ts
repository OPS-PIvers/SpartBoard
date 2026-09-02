import type { QuizData, QuizQuestionType } from '@/types';

const LEGACY_WRITTEN_TYPES = new Set(['short', 'essay']);

/** Maps the retired 'short'/'essay' values onto 'free-response'. */
export function normalizeLegacyQuestionType(type: string): QuizQuestionType {
  return LEGACY_WRITTEN_TYPES.has(type)
    ? 'free-response'
    : (type as QuizQuestionType);
}

/** Returns the same array reference when no question needed rewriting. */
export function normalizeQuizQuestions<T extends { type: string }>(
  questions: T[]
): T[];
export function normalizeQuizQuestions<T extends { type: string }>(
  questions: T[] | undefined
): T[] | undefined;
export function normalizeQuizQuestions<T extends { type: string }>(
  questions: T[] | null
): T[] | null;
export function normalizeQuizQuestions<T extends { type: string }>(
  questions: T[] | null | undefined
): T[] | null | undefined {
  if (!Array.isArray(questions)) return questions;
  let changed = false;
  const next = questions.map((q) => {
    const type = normalizeLegacyQuestionType(q?.type);
    if (!q || type === q.type) return q;
    changed = true;
    return { ...q, type };
  });
  return changed ? next : questions;
}

/** Returns the same quiz reference when no question needed rewriting. */
export function normalizeQuizData(data: QuizData): QuizData {
  const questions = data?.questions;
  if (!Array.isArray(questions)) return data;
  const next = normalizeQuizQuestions(questions);
  return next === questions ? data : { ...data, questions: next };
}
