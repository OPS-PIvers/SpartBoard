/**
 * Publish-time translation loading and the session-doc size budget (§4.2).
 * A locale that fails to load is dropped and logged; a publish is never blocked.
 */

import type {
  QuizPublicQuestion,
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
  StudentOverride,
} from '@/types';
import { hashQuestionForTranslation } from './quizTranslationHash';

/** Serialized-UTF-8 ceiling; Firestore's hard limit is 1 MiB. */
export const SESSION_DOC_BYTE_BUDGET = 900_000;

export interface PublishTranslations {
  byLocale: Record<string, QuizTranslation>;
  freshQuestionIdsByLocale: Record<string, ReadonlySet<string>>;
  titleByLocale: Record<string, string>;
}

const EMPTY: PublishTranslations = {
  byLocale: {},
  freshQuestionIdsByLocale: {},
  titleByLocale: {},
};

/** The union of `language` across the overrides this assignment actually targets. */
export function targetedLocaleCounts(
  overrides: Record<string, StudentOverride> | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const override of Object.values(overrides ?? {})) {
    const code = override.language;
    if (!code) continue;
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

export interface TranslationLoader {
  loadTranslation(fileId: string): Promise<QuizTranslation>;
}

/**
 * Loads every needed sidecar in parallel and computes the reviewed+fresh id set
 * per locale. Bank-slot quizzes are never translated (D29), so callers skip them.
 */
export async function loadTranslationsForPublish(
  loader: TranslationLoader | null,
  index: Record<string, QuizTranslationIndexEntry> | undefined,
  locales: string[],
  questions: QuizQuestion[]
): Promise<PublishTranslations> {
  const wanted = locales.filter((code) => !!index?.[code]?.driveFileId);
  if (!loader || wanted.length === 0) return EMPTY;

  const results = await Promise.allSettled(
    wanted.map((code) => loader.loadTranslation(index![code].driveFileId))
  );

  const liveHashes = new Map<string, string>();
  for (const q of questions)
    liveHashes.set(q.id, await hashQuestionForTranslation(q));

  const out: PublishTranslations = {
    byLocale: {},
    freshQuestionIdsByLocale: {},
    titleByLocale: {},
  };
  results.forEach((result, i) => {
    const code = wanted[i];
    if (result.status !== 'fulfilled') {
      console.error(
        `[quizTranslationPublish] ${code} sidecar failed to load; serving English`,
        result.reason
      );
      return;
    }
    const payload = result.value;
    const fresh = new Set<string>();
    for (const q of questions) {
      if (payload.sourceHashes?.[q.id] === liveHashes.get(q.id))
        fresh.add(q.id);
    }
    out.byLocale[code] = payload;
    out.freshQuestionIdsByLocale[code] = fresh;
    if (payload.title) out.titleByLocale[code] = payload.title;
  });
  return out;
}

const byteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** Strips one locale from every question and from the localized title map. */
function stripLocale<T extends { publicQuestions: QuizPublicQuestion[] }>(
  session: T & { quizTitleLocalized?: Record<string, string> },
  locale: string
): void {
  for (const q of session.publicQuestions) {
    if (q.localized) {
      delete q.localized[locale];
      if (Object.keys(q.localized).length === 0) delete q.localized;
    }
  }
  if (session.quizTitleLocalized) {
    delete session.quizTitleLocalized[locale];
    if (Object.keys(session.quizTitleLocalized).length === 0)
      delete session.quizTitleLocalized;
  }
}

/**
 * Drops locales, fewest targeted students first, until the serialized session
 * fits the budget. Mutates in place and returns the codes it dropped.
 */
export function enforceSessionSizeBudget<
  T extends {
    publicQuestions: QuizPublicQuestion[];
    quizTitleLocalized?: Record<string, string>;
  },
>(
  session: T,
  targetedCountByLocale: Record<string, number>,
  budget: number = SESSION_DOC_BYTE_BUDGET
): string[] {
  const dropped: string[] = [];
  const order = Object.keys(targetedCountByLocale).sort(
    (a, b) =>
      (targetedCountByLocale[a] ?? 0) - (targetedCountByLocale[b] ?? 0) ||
      a.localeCompare(b)
  );
  for (const locale of order) {
    if (byteLength(session) <= budget) break;
    stripLocale(session, locale);
    dropped.push(locale);
  }
  if (dropped.length > 0) {
    console.error(
      '[quizTranslationPublish] session doc over budget; dropped locales',
      dropped
    );
  }
  return dropped;
}
