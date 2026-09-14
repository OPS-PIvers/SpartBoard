/**
 * Translated FIB answer keys (PR4). Snapshotted onto the teacher-owned
 * assignment doc at assign time — never onto the world-readable session doc
 * and never into the Drive quiz body, which would invalidate the source hash.
 */

import type { QuizQuestion, QuizResponse, QuizTranslation } from '@/types';
import { fibTranslationIssue } from './quizFibTranslation';

/** `{ [questionId]: { [locale]: acceptedAnswers } }`. */
export type LocalizedFibAnswers = Record<string, Record<string, string[]>>;

/**
 * Mirrors the publish gate: only a reviewed AND fresh sidecar entry is
 * snapshotted, so a stale or unreviewed translation is never graded against.
 */
export function collectLocalizedFibAnswers(
  questions: QuizQuestion[],
  byLocale: Record<string, QuizTranslation>,
  freshQuestionIdsByLocale: Record<string, ReadonlySet<string>> | undefined
): LocalizedFibAnswers {
  const out: LocalizedFibAnswers = {};
  for (const q of questions) {
    if (q.type !== 'FIB') continue;
    for (const [locale, translation] of Object.entries(byLocale ?? {})) {
      const entry = translation.questions?.[q.id];
      const answer = entry?.answer;
      if (!answer || !answer.trim()) continue;
      if (fibTranslationIssue(q, entry)) continue;
      if (!translation.reviewedQuestionIds?.includes(q.id)) continue;
      if (!freshQuestionIdsByLocale?.[locale]?.has(q.id)) continue;
      out[q.id] = { ...(out[q.id] ?? {}), [locale]: [answer] };
    }
  }
  return out;
}

/**
 * Accepted answers for ONE question in the ONE locale the student was served.
 * English is accepted by `gradeAnswer` itself, so an unknown served locale
 * (no teacher-side override) correctly yields English-only grading.
 */
export function fibAcceptedAnswers(
  map: LocalizedFibAnswers | null | undefined,
  questionId: string,
  servedLocale: string | undefined
): string[] {
  if (!servedLocale) return [];
  const answers = map?.[questionId]?.[servedLocale];
  if (!Array.isArray(answers)) return [];
  return answers.filter(
    (a): a is string => typeof a === 'string' && a.trim() !== ''
  );
}

/** Per-student override maps from the teacher-owned assignment doc. */
export interface ServedLocaleSource {
  overridesByStudentUid?: Record<string, { language?: string }> | null;
  overridesBySourcedId?: Record<string, { language?: string }> | null;
}

/**
 * The locale the TEACHER served this student, never the client-asserted
 * `response.locale` — a student could otherwise claim a locale to widen the
 * accepted answer set. Undefined when no override names one.
 */
export function servedLocaleForResponse(
  response: Pick<QuizResponse, 'studentUid'> & { sourcedId?: string },
  source: ServedLocaleSource | null | undefined
): string | undefined {
  if (!source) return undefined;
  const byUid = response.studentUid
    ? source.overridesByStudentUid?.[response.studentUid]?.language
    : undefined;
  if (byUid) return byUid;
  return response.sourcedId
    ? source.overridesBySourcedId?.[response.sourcedId]?.language
    : undefined;
}

/** What every teacher-side grading surface needs to grade a translated FIB. */
export interface FibGradingContext extends ServedLocaleSource {
  answers?: LocalizedFibAnswers | null;
}

/** Accepted answers for one response/question pair, scoped to its served locale. */
export function fibAnswersForResponse(
  ctx: FibGradingContext | null | undefined,
  response: Pick<QuizResponse, 'studentUid'> & { sourcedId?: string },
  questionId: string
): string[] {
  if (!ctx?.answers) return [];
  return fibAcceptedAnswers(
    ctx.answers,
    questionId,
    servedLocaleForResponse(response, ctx)
  );
}
