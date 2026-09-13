/** Non-English source (D17) blocks generation before the callable is reached. */
import type { QuizData } from '@/types';

export function isNonEnglishSource(quiz: QuizData): boolean {
  const lang = quiz.language?.trim().toLowerCase();
  return !!lang && !lang.startsWith('en');
}
