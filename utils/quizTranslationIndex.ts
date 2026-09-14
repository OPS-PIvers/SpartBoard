/** `QuizMetadata.translations` upkeep: the index is a cache, the sidecar is the authority (plan §9). */

import type {
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import { isTranslatableQuestionType } from '@/config/quizTranslation';
import { hashQuestionForTranslation } from './quizTranslationHash';

/** Index counts live over the translatable subset (all types since PR4). */
export function translatableQuestions(
  questions: QuizQuestion[]
): QuizQuestion[] {
  return questions.filter((q) => isTranslatableQuestionType(q.type));
}

/** Ids whose live hash no longer matches the hash captured at translation time. */
export async function staleQuestionIds(
  questions: QuizQuestion[],
  sourceHashes: Record<string, string>
): Promise<string[]> {
  const stale: string[] = [];
  for (const q of translatableQuestions(questions)) {
    const hash = await hashQuestionForTranslation(q);
    if (sourceHashes[q.id] !== hash) stale.push(q.id);
  }
  return stale;
}

/**
 * Carries an existing index forward against the in-memory quiz body, recomputing
 * `staleCount` and `questionCount` over the translatable subset. Returns undefined when there is nothing to
 * carry, so a quiz with no translations never gains an empty `translations` key.
 */
export async function recomputeTranslationIndex(
  existing: Record<string, QuizTranslationIndexEntry> | undefined,
  questions: QuizQuestion[]
): Promise<Record<string, QuizTranslationIndexEntry> | undefined> {
  if (!existing || Object.keys(existing).length === 0) return undefined;
  const translatableCount = translatableQuestions(questions).length;
  const next: Record<string, QuizTranslationIndexEntry> = {};
  for (const [locale, entry] of Object.entries(existing)) {
    const stale = await staleQuestionIds(questions, entry.sourceHashes ?? {});
    next[locale] = {
      ...entry,
      questionCount: translatableCount,
      staleCount: stale.length,
    };
  }
  return next;
}

/** Index row for a freshly written sidecar. */
export async function buildTranslationIndexEntry(
  driveFileId: string,
  payload: QuizTranslation,
  questions: QuizQuestion[]
): Promise<QuizTranslationIndexEntry> {
  const stale = await staleQuestionIds(questions, payload.sourceHashes ?? {});
  const translatable = translatableQuestions(questions);
  const translatableIds = new Set(translatable.map((q) => q.id));
  return {
    driveFileId,
    reviewedCount: payload.reviewedQuestionIds.filter((id) =>
      translatableIds.has(id)
    ).length,
    staleCount: stale.length,
    questionCount: translatable.length,
    sourceHashes: { ...payload.sourceHashes },
    updatedAt: payload.updatedAt,
  };
}

/**
 * Per-locale sets of question ids whose live hash still matches the hash the
 * sidecar recorded. Feeds `selectQuestionTranslations`'s freshness gate (§4.3).
 */
export async function freshQuestionIdsByLocale(
  questions: QuizQuestion[],
  translations: Record<string, QuizTranslation> | undefined
): Promise<Record<string, ReadonlySet<string>>> {
  const out: Record<string, ReadonlySet<string>> = {};
  if (!translations) return out;
  const live = new Map<string, string>();
  for (const q of questions)
    live.set(q.id, await hashQuestionForTranslation(q));
  for (const [locale, translation] of Object.entries(translations)) {
    const fresh = new Set<string>();
    for (const [id, hash] of live) {
      if (translation.sourceHashes?.[id] === hash) fresh.add(id);
    }
    out[locale] = fresh;
  }
  return out;
}
