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
import { isTranslatableQuestionType } from '@/config/quizTranslation';
import { hashQuestionForTranslation } from './quizTranslationHash';

/** Serialized-UTF-8 ceiling; Firestore's hard limit is 1 MiB. */
export const SESSION_DOC_BYTE_BUDGET = 900_000;

/** Storage path + timing rows for one manifest part, rounded up. */
export const READ_ALOUD_MANIFEST_BYTES_PER_PART = 260;

/** Parts the read-aloud manifest will hold: one stem plus every listed option. */
export function estimateReadAloudPartCount(
  questions: readonly {
    choices?: unknown;
    matchingLeft?: unknown;
    matchingRight?: unknown;
    orderingItems?: unknown;
  }[]
): number {
  const len = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  return questions.reduce(
    (total, q) =>
      total +
      1 +
      len(q.choices) +
      len(q.matchingLeft) +
      len(q.matchingRight) +
      len(q.orderingItems),
    0
  );
}

/**
 * Bytes `session.readAloud` will add after the publish write. The manifest is
 * written by the server outside this budget, so reserve it here or the session
 * fits at publish time and blows the 1 MiB limit once audio is prepared.
 */
export function estimateReadAloudManifestBytes(
  partCount: number,
  localeCount: number
): number {
  return (
    partCount *
    READ_ALOUD_MANIFEST_BYTES_PER_PART *
    (1 + Math.max(0, localeCount))
  );
}

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

/** A stalled sidecar load must never block a publish (§4.2). */
export const TRANSLATION_LOAD_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Translation sidecar load timed out')),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
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
  questions: QuizQuestion[],
  timeoutMs: number = TRANSLATION_LOAD_TIMEOUT_MS
): Promise<PublishTranslations> {
  const wanted = locales.filter((code) => !!index?.[code]?.driveFileId);
  if (!loader || wanted.length === 0) return EMPTY;

  const results = await Promise.allSettled(
    wanted.map((code) => {
      const entry = index?.[code];
      if (!entry?.driveFileId)
        return Promise.reject(new Error(`No sidecar for ${code}`));
      return withTimeout(loader.loadTranslation(entry.driveFileId), timeoutMs);
    })
  );

  const hashable = questions.filter((q) => isTranslatableQuestionType(q.type));
  const liveHashes = new Map<string, string>(
    await Promise.all(
      hashable.map(
        async (q) =>
          [q.id, await hashQuestionForTranslation(q)] as [string, string]
      )
    )
  );

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
      // D21: FIB never serves a translation, so it never counts as fresh.
      if (!isTranslatableQuestionType(q.type)) continue;
      if (payload.sourceHashes?.[q.id] === liveHashes.get(q.id))
        fresh.add(q.id);
    }
    out.byLocale[code] = payload;
    out.freshQuestionIdsByLocale[code] = fresh;
    // The sidecar title rides the same review gate as the questions (§4.2).
    const servesAnything = payload.reviewedQuestionIds.some((id) =>
      fresh.has(id)
    );
    if (payload.title && servesAnything)
      out.titleByLocale[code] = payload.title;
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
  budget: number = SESSION_DOC_BYTE_BUDGET,
  /** Bytes a later write (the read-aloud manifest) will add to the same doc. */
  reservedBytes = 0
): string[] {
  const dropped: string[] = [];
  const present = new Set<string>();
  for (const q of session.publicQuestions)
    for (const code of Object.keys(q.localized ?? {})) present.add(code);
  for (const code of Object.keys(session.quizTitleLocalized ?? {}))
    present.add(code);
  const order = Object.keys(targetedCountByLocale)
    .filter((code) => present.has(code))
    .sort(
      (a, b) =>
        (targetedCountByLocale[a] ?? 0) - (targetedCountByLocale[b] ?? 0) ||
        a.localeCompare(b)
    );
  for (const locale of order) {
    if (byteLength(session) + reservedBytes <= budget) break;
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
