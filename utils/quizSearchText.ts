import type { QuizQuestion } from '@/types';

/** Cap keeps the metadata doc small; ~2k chars covers 60+ typical questions. */
const SEARCH_TEXT_MAX_CHARS = 2000;

/** Lowercased question-text blob stored on QuizMetadata for library search. */
export function buildQuizSearchText(questions: QuizQuestion[]): string {
  return questions
    .map((q) => q.text)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_TEXT_MAX_CHARS);
}

/** Stable identity for exact-duplicate detection when merging quizzes. */
export function quizQuestionDedupeKey(q: QuizQuestion): string {
  const norm = (s: string): string => s.trim().toLowerCase();
  const incorrect = (q.incorrectAnswers ?? []).map(norm).sort();
  return JSON.stringify([
    q.type,
    norm(q.text ?? ''),
    norm(String(q.correctAnswer ?? '')),
    incorrect,
  ]);
}
