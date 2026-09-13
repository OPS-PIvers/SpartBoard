/**
 * Languages-tab state for one quiz (docs/plans/QUIZ_TRANSLATION.md §8).
 * Deliberately independent of the editor's own dirty/save cycle: a discarded
 * quiz edit must not lose a translation edit, and a quiz save must never push
 * unreviewed strings.
 */

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import type {
  QuestionTranslation,
  QuizData,
  QuizMetadata,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import { isTranslatableQuestionType } from '@/config/quizTranslation';
import { QuizDriveService } from '@/utils/quizDriveService';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import { hashQuestionForTranslation } from '@/utils/quizTranslationHash';
import { buildTranslationIndexEntry } from '@/utils/quizTranslationIndex';

const QUIZZES_COLLECTION = 'quizzes';

interface TranslateQuizResponse {
  title?: string;
  questions: Record<string, QuestionTranslation>;
  sourceHashes: Record<string, string>;
  model: string;
  outputTokens: number;
  cap: { remaining: number; total: number };
}

export interface UseQuizTranslations {
  /** Question ids eligible for translation (FIB excluded, D21). */
  translatableIds: string[];
  byLocale: Record<string, QuizTranslation | undefined>;
  loading: Record<string, boolean>;
  load(locale: string): Promise<void>;
  generate(locale: string, questionIds?: string[]): Promise<void>;
  editQuestion(
    locale: string,
    questionId: string,
    patch: Partial<QuestionTranslation>
  ): void;
  setReviewed(locale: string, questionId: string, reviewed: boolean): void;
  save(locale: string): Promise<void>;
  staleIds(locale: string): string[];
  cap: { remaining: number; total: number } | null;
  error: string | null;
  /** Sidecar load failed for this locale; the caller may retry. */
  loadFailed: Record<string, boolean>;
  /** True when the locale has a saved sidecar that is not loaded yet. */
  needsLoad(locale: string): boolean;
}

export function useQuizTranslations(
  quiz: QuizData | null,
  metadata: QuizMetadata | null
): UseQuizTranslations {
  // Read via context so a provider-less host denies instead of throwing.
  const authContext = useContext(AuthContext);
  const user = authContext?.user ?? null;
  const googleAccessToken = authContext?.googleAccessToken ?? null;
  const [byLocale, setByLocale] = useState<
    Record<string, QuizTranslation | undefined>
  >({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [liveHashes, setLiveHashes] = useState<Record<string, string>>({});
  const [cap, setCap] = useState<{ remaining: number; total: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState<Record<string, boolean>>({});

  const userId = user?.uid ?? null;

  const getDrive = useCallback(() => {
    if (isAuthBypass) {
      if (!userId) throw new Error('Not authenticated');
      return new MockQuizDriveService(userId);
    }
    if (!googleAccessToken)
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    return new QuizDriveService(googleAccessToken);
  }, [googleAccessToken, userId]);

  const questions = useMemo(() => quiz?.questions ?? [], [quiz]);
  // D21: FIB stays English, so it is never requested, hashed or counted.
  const translatable = useMemo(
    () => questions.filter((q) => isTranslatableQuestionType(q.type)),
    [questions]
  );
  const translatableIds = useMemo(
    () => translatable.map((q) => q.id),
    [translatable]
  );

  const refreshHashes = useCallback(async () => {
    const next: Record<string, string> = {};
    for (const q of translatable)
      next[q.id] = await hashQuestionForTranslation(q);
    setLiveHashes(next);
    return next;
  }, [translatable]);

  // Hashing is async (crypto.subtle), so staleness can only be recomputed in an
  // effect; without this, an edit made after load never shows as stale.
  useEffect(() => {
    if (!quiz) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const q of questions)
        next[q.id] = await hashQuestionForTranslation(q);
      if (!cancelled) setLiveHashes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [questions, quiz]);

  const load = useCallback(
    async (locale: string) => {
      const entry = metadata?.translations?.[locale];
      if (!entry) return;
      setLoading((l) => ({ ...l, [locale]: true }));
      setError(null);
      setLoadFailed((f) => (f[locale] ? { ...f, [locale]: false } : f));
      try {
        const payload = await getDrive().loadTranslation(entry.driveFileId);
        setByLocale((b) => ({ ...b, [locale]: payload }));
        await refreshHashes();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed');
        // Re-arm the caller's one-shot guard so re-selecting the chip retries.
        setLoadFailed((f) => ({ ...f, [locale]: true }));
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [getDrive, metadata, refreshHashes]
  );

  const writeIndex = useCallback(
    async (locale: string, entry: QuizTranslationIndexEntry) => {
      if (!userId || !quiz) return;
      await setDoc(
        doc(db, 'users', userId, QUIZZES_COLLECTION, quiz.id),
        { translations: { [locale]: entry } },
        { merge: true }
      );
    },
    [quiz, userId]
  );

  const persist = useCallback(
    async (locale: string, payload: QuizTranslation) => {
      if (!quiz) return;
      const drive = getDrive();
      // Sidecar first, index second (§3.3): an orphan file beats a dangling row.
      const fileId = await drive.saveTranslation(
        quiz.id,
        quiz.title,
        locale,
        payload,
        metadata?.translations?.[locale]?.driveFileId
      );
      const entry = await buildTranslationIndexEntry(
        fileId,
        payload,
        questions
      );
      try {
        await writeIndex(locale, entry);
      } catch (err) {
        if (!metadata?.translations?.[locale]) {
          await drive.deleteTranslation(fileId).catch(() => undefined);
        }
        throw err;
      }
    },
    [getDrive, metadata, questions, quiz, writeIndex]
  );

  const generate = useCallback(
    async (locale: string, questionIds?: string[]) => {
      if (!quiz) return;
      // An unloaded sidecar would make the merge drop every reviewed id (data loss).
      if (metadata?.translations?.[locale] && !byLocale[locale]) {
        setError('quizTranslation.editor.error.unloadedLocale');
        return;
      }
      setLoading((l) => ({ ...l, [locale]: true }));
      setError(null);
      try {
        const callable = httpsCallable<
          Record<string, unknown>,
          TranslateQuizResponse
        >(functions, 'translateQuizV1');
        const { data } = await callable({
          quizId: quiz.id,
          locale,
          title: quiz.title,
          ...(quiz.language ? { sourceLanguage: quiz.language } : {}),
          questions: translatable,
          ...(questionIds
            ? {
                questionIds: questionIds.filter((id) =>
                  translatableIds.includes(id)
                ),
              }
            : {}),
          ...(quiz.bankSlots ? { bankSlots: quiz.bankSlots } : {}),
        });
        setCap(data.cap);
        const now = Date.now();
        const previous = byLocale[locale];
        const merged: QuizTranslation = {
          locale,
          title: data.title ?? previous?.title ?? quiz.title,
          questions: { ...(previous?.questions ?? {}), ...data.questions },
          sourceHashes: {
            ...(previous?.sourceHashes ?? {}),
            ...data.sourceHashes,
          },
          // Regenerated strings are machine output again: un-review them.
          reviewedQuestionIds: (previous?.reviewedQuestionIds ?? []).filter(
            (id) => !Object.keys(data.questions).includes(id)
          ),
          model: data.model,
          generatedAt: previous?.generatedAt ?? now,
          updatedAt: now,
        };
        setByLocale((b) => ({ ...b, [locale]: merged }));
        await refreshHashes();
        await persist(locale, merged);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [
      byLocale,
      metadata,
      persist,
      quiz,
      refreshHashes,
      translatable,
      translatableIds,
    ]
  );

  const editQuestion = useCallback(
    (
      locale: string,
      questionId: string,
      patch: Partial<QuestionTranslation>
    ) => {
      setByLocale((b) => {
        const current = b[locale];
        if (!current) return b;
        const existing = current.questions[questionId];
        if (!existing) return b;
        return {
          ...b,
          [locale]: {
            ...current,
            questions: {
              ...current.questions,
              [questionId]: { ...existing, ...patch },
            },
            // An edited string is no longer the string the teacher approved.
            reviewedQuestionIds: current.reviewedQuestionIds.filter(
              (id) => id !== questionId
            ),
            updatedAt: Date.now(),
          },
        };
      });
    },
    []
  );

  const setReviewed = useCallback(
    (locale: string, questionId: string, reviewed: boolean) => {
      setByLocale((b) => {
        const current = b[locale];
        if (!current) return b;
        const others = current.reviewedQuestionIds.filter(
          (id) => id !== questionId
        );
        return {
          ...b,
          [locale]: {
            ...current,
            reviewedQuestionIds: reviewed ? [...others, questionId] : others,
            updatedAt: Date.now(),
          },
        };
      });
    },
    []
  );

  const save = useCallback(
    async (locale: string) => {
      const payload = byLocale[locale];
      if (!payload) return;
      setLoading((l) => ({ ...l, [locale]: true }));
      setError(null);
      try {
        await persist(locale, payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [byLocale, persist]
  );

  const staleIds = useCallback(
    (locale: string): string[] => {
      const hashes =
        byLocale[locale]?.sourceHashes ??
        metadata?.translations?.[locale]?.sourceHashes;
      if (!hashes) return [];
      return translatable
        .filter((q) => {
          const live = liveHashes[q.id];
          return live !== undefined && hashes[q.id] !== live;
        })
        .map((q) => q.id);
    },
    [byLocale, liveHashes, metadata, translatable]
  );

  const needsLoad = useCallback(
    (locale: string): boolean =>
      !!metadata?.translations?.[locale] && !byLocale[locale],
    [byLocale, metadata]
  );

  return {
    translatableIds,
    byLocale,
    loading,
    load,
    generate,
    editQuestion,
    setReviewed,
    save,
    staleIds,
    cap,
    error,
    loadFailed,
    needsLoad,
  };
}
