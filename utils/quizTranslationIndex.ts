/** `QuizMetadata.translations` upkeep: the index is a cache, the sidecar is the authority (plan §9). */

import type {
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import { hashQuestionForTranslation } from './quizTranslationHash';

/** Ids whose live hash no longer matches the hash captured at translation time. */
export async function staleQuestionIds(
  questions: QuizQuestion[],
  sourceHashes: Record<string, string>
): Promise<string[]> {
  const stale: string[] = [];
  for (const q of questions) {
    const hash = await hashQuestionForTranslation(q);
    if (sourceHashes[q.id] !== hash) stale.push(q.id);
  }
  return stale;
}

/**
 * Carries an existing index forward against the in-memory quiz body, recomputing
 * `staleCount` and `questionCount`. Returns undefined when there is nothing to
 * carry, so a quiz with no translations never gains an empty `translations` key.
 */
export async function recomputeTranslationIndex(
  existing: Record<string, QuizTranslationIndexEntry> | undefined,
  questions: QuizQuestion[]
): Promise<Record<string, QuizTranslationIndexEntry> | undefined> {
  if (!existing || Object.keys(existing).length === 0) return undefined;
  const next: Record<string, QuizTranslationIndexEntry> = {};
  for (const [locale, entry] of Object.entries(existing)) {
    const stale = await staleQuestionIds(questions, entry.sourceHashes ?? {});
    next[locale] = {
      ...entry,
      questionCount: questions.length,
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
  return {
    driveFileId,
    reviewedCount: payload.reviewedQuestionIds.length,
    staleCount: stale.length,
    questionCount: questions.length,
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
