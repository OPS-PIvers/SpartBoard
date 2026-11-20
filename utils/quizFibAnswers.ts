/**
 * Translated FIB answer keys (PR4). Snapshotted onto the teacher-owned
 * assignment doc at assign time — never onto the world-readable session doc
 * and never into the Drive quiz body, which would invalidate the source hash.
 */

import type { QuizQuestion, QuizResponse, QuizTranslation } from '@/types';
import { fibTranslationIssue } from './quizFibTranslation';
import type { FibExtras } from './quizFibMatch';

/** `{ [questionId]: { [locale]: acceptedAnswers } }`; the `*` locale holds answers a teacher accepted for everyone. */
export type LocalizedFibAnswers = Record<string, Record<string, string[]>>;

/** Locale key for answers a teacher accepted in results; they count for every student. */
export const ANY_LOCALE = '*';

const cleanList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
    : [];

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
 * Accepted answers for ONE question: the served locale's key plus any answer a
 * teacher accepted. English is accepted by `gradeAnswer` itself. Matching turns
 * lenient only when the served locale is in `lenientLocales` and has a key here.
 */
export function fibAcceptedAnswers(
  map: LocalizedFibAnswers | null | undefined,
  questionId: string,
  servedLocale: string | undefined,
  lenientLocales?: readonly string[] | null
): FibExtras {
  const byLocale = map?.[questionId];
  const accepted = cleanList(byLocale?.[ANY_LOCALE]);
  const translated =
    servedLocale && servedLocale !== ANY_LOCALE
      ? cleanList(byLocale?.[servedLocale])
      : [];
  return servedLocale &&
    translated.length > 0 &&
    lenientLocales?.includes(servedLocale)
    ? { answers: translated, exact: accepted, lenientLocale: servedLocale }
    : [...translated, ...accepted];
}

/** Translated locales other than the quiz's own language; a World Language quiz stays exact. */
export function lenientLocalesFor(
  answers: LocalizedFibAnswers,
  quizLanguage: string | undefined
): string[] {
  const own = (quizLanguage?.trim() ? quizLanguage : 'en')
    .toLowerCase()
    .split('-')[0];
  const locales = new Set<string>();
  for (const byLocale of Object.values(answers))
    for (const locale of Object.keys(byLocale))
      if (locale !== ANY_LOCALE && locale.toLowerCase().split('-')[0] !== own)
        locales.add(locale);
  return [...locales].sort();
}

/** Carries teacher-accepted answers over when a key is rebuilt, for questions that still exist. */
export function keepTeacherAccepted(
  next: LocalizedFibAnswers,
  previous: LocalizedFibAnswers | null | undefined,
  questionIds: ReadonlySet<string>
): LocalizedFibAnswers {
  const out: LocalizedFibAnswers = { ...next };
  for (const [qid, byLocale] of Object.entries(previous ?? {})) {
    const accepted = cleanList(byLocale?.[ANY_LOCALE]);
    if (accepted.length === 0 || !questionIds.has(qid)) continue;
    out[qid] = { ...(out[qid] ?? {}), [ANY_LOCALE]: accepted };
  }
  return out;
}

/** Per-student override maps from the teacher-owned assignment doc. */
export interface ServedLocaleSource {
  overridesByStudentUid?: Record<
    string,
    { language?: string; modifiedQuestions?: boolean }
  > | null;
  overridesBySourcedId?: Record<
    string,
    { language?: string; modifiedQuestions?: boolean }
  > | null;
  /** Write-once served-language record the CF never clears; survives a de-target. */
  servedLanguageByStudentUid?: Record<string, string> | null;
  /** Only a student-paced session shows the modified prompt. */
  sessionMode?: string;
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
  const remembered = response.studentUid
    ? source.servedLanguageByStudentUid?.[response.studentUid]
    : undefined;
  if (remembered) return remembered;
  return response.sourcedId
    ? source.overridesBySourcedId?.[response.sourcedId]?.language
    : undefined;
}

/** What every teacher-side grading surface needs to grade a translated FIB. */
export interface FibGradingContext extends ServedLocaleSource {
  answers?: LocalizedFibAnswers | null;
  /** Served locales graded with typo leniency, from the assignment doc. */
  lenientLocales?: readonly string[] | null;
}

/** The FIB grading context an assignment doc carries. */
export function fibGradingFromAssignment(
  assignment:
    | (ServedLocaleSource & {
        localizedFibAnswers?: LocalizedFibAnswers | null;
        lenientFibLocales?: readonly string[] | null;
      })
    | null
    | undefined
): FibGradingContext {
  return {
    answers: assignment?.localizedFibAnswers ?? null,
    lenientLocales: assignment?.lenientFibLocales ?? null,
    overridesByStudentUid: assignment?.overridesByStudentUid ?? null,
    overridesBySourcedId: assignment?.overridesBySourcedId ?? null,
    servedLanguageByStudentUid: assignment?.servedLanguageByStudentUid ?? null,
    sessionMode: assignment?.sessionMode,
  };
}

/** Accepted answers for one response/question pair, scoped to its served locale. */
export function fibAnswersForResponse(
  ctx: FibGradingContext | null | undefined,
  response: Pick<QuizResponse, 'studentUid'> & { sourcedId?: string },
  questionId: string
): FibExtras {
  if (!ctx?.answers) return [];
  return fibAcceptedAnswers(
    ctx.answers,
    questionId,
    servedLocaleForResponse(response, ctx),
    ctx.lenientLocales
  );
}
