/**
 * Languages-tab state for one quiz (docs/plans/QUIZ_TRANSLATION.md §8).
 * Review ticks save immediately; text edits save with "Save translation" or the
 * editor's main Save (`saveAll`). Only reviewed + fresh questions ever publish.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  QUIZ_TRANSLATION_FEATURE,
  isTranslatableQuestionType,
} from '@/config/quizTranslation';
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
  /** Question ids eligible for translation. */
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
  /** Also saves the locale immediately; a failure surfaces in `error`. */
  setReviewed(locale: string, questionId: string, reviewed: boolean): void;
  save(locale: string): Promise<void>;
  /** Saves every locale with unsaved changes; rejects if any save fails. */
  saveAll(): Promise<void>;
  hasUnsavedChanges: boolean;
  staleIds(locale: string): string[];
  cap: { remaining: number; total: number } | null;
  error: string | null;
  /** Sidecar load failed for this locale; the caller may retry. */
  loadFailed: Record<string, boolean>;
  /** True when the locale has a saved sidecar that is not loaded yet. */
  needsLoad(locale: string): boolean;
}

export interface UseQuizTranslationsOptions {
  /** Defaults to the caller's `quiz-translation` access; false skips all hashing. */
  enabled?: boolean;
}

export function useQuizTranslations(
  quiz: QuizData | null,
  metadata: QuizMetadata | null,
  options: UseQuizTranslationsOptions = {}
): UseQuizTranslations {
  // Read via context so a provider-less host denies instead of throwing.
  const authContext = useContext(AuthContext);
  // No context method to ask means no gate to apply, so behavior is unchanged.
  const enabled =
    options.enabled ??
    authContext?.canAccessFeature?.(QUIZ_TRANSLATION_FEATURE) ??
    true;
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
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  // Mirrors `byLocale` synchronously so a queued save always writes the newest payload.
  const byLocaleRef = useRef(byLocale);
  // The index row lags a first save, so a follow-up save must reuse this id, not create a file.
  const fileIdRef = useRef<Record<string, string>>({});
  const saveChainRef = useRef<Record<string, Promise<void>>>({});

  const commit = useCallback((locale: string, next: QuizTranslation) => {
    byLocaleRef.current = { ...byLocaleRef.current, [locale]: next };
    setByLocale(byLocaleRef.current);
  }, []);

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
  // The translatable subset drives requests, hashing and counts.
  const translatable = useMemo(
    () => questions.filter((q) => isTranslatableQuestionType(q.type)),
    [questions]
  );
  const translatableIds = useMemo(
    () => translatable.map((q) => q.id),
    [translatable]
  );

  const refreshHashes = useCallback(async () => {
    if (!enabled) return {};
    const next: Record<string, string> = {};
    for (const q of translatable)
      next[q.id] = await hashQuestionForTranslation(q);
    setLiveHashes(next);
    return next;
  }, [enabled, translatable]);

  // Hashing is async (crypto.subtle), so staleness can only be recomputed in an
  // effect; without this, an edit made after load never shows as stale.
  useEffect(() => {
    if (!quiz || !enabled) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const q of translatable)
        next[q.id] = await hashQuestionForTranslation(q);
      if (!cancelled) setLiveHashes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, quiz, translatable]);

  const load = useCallback(
    async (locale: string) => {
      const entry = metadata?.translations?.[locale];
      if (!entry) return;
      setLoading((l) => ({ ...l, [locale]: true }));
      setError(null);
      setLoadFailed((f) => (f[locale] ? { ...f, [locale]: false } : f));
      try {
        const payload = await getDrive().loadTranslation(entry.driveFileId);
        fileIdRef.current[locale] ??= entry.driveFileId;
        commit(locale, payload);
        await refreshHashes();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed');
        // Re-arm the caller's one-shot guard so re-selecting the chip retries.
        setLoadFailed((f) => ({ ...f, [locale]: true }));
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [commit, getDrive, metadata, refreshHashes]
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
      const existingId =
        fileIdRef.current[locale] ??
        metadata?.translations?.[locale]?.driveFileId;
      // Sidecar first, index second (§3.3): an orphan file beats a dangling row.
      const fileId = await drive.saveTranslation(
        quiz.id,
        quiz.title,
        locale,
        payload,
        existingId
      );
      const entry = await buildTranslationIndexEntry(
        fileId,
        payload,
        questions
      );
      try {
        await writeIndex(locale, entry);
      } catch (err) {
        if (!existingId) {
          await drive.deleteTranslation(fileId).catch(() => undefined);
        }
        throw err;
      }
      fileIdRef.current[locale] = fileId;
    },
    [getDrive, metadata, questions, quiz, writeIndex]
  );

  // Saves run one at a time per locale, so an older payload can never land after a newer one.
  const enqueueSave = useCallback(
    (locale: string): Promise<void> => {
      const run = async () => {
        const payload = byLocaleRef.current[locale];
        if (!payload) return;
        await persist(locale, payload);
        if (byLocaleRef.current[locale] === payload)
          setDirty((d) => ({ ...d, [locale]: false }));
      };
      const next = (saveChainRef.current[locale] ?? Promise.resolve())
        .catch(() => undefined)
        .then(run);
      saveChainRef.current[locale] = next;
      return next;
    },
    [persist]
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
        const previous = byLocaleRef.current[locale];
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
        commit(locale, merged);
        await refreshHashes();
        await enqueueSave(locale);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [
      byLocale,
      commit,
      enqueueSave,
      metadata,
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
      const current = byLocaleRef.current[locale];
      const existing = current?.questions[questionId];
      if (!current || !existing) return;
      commit(locale, {
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
      });
      setDirty((d) => ({ ...d, [locale]: true }));
    },
    [commit]
  );

  const setReviewed = useCallback(
    (locale: string, questionId: string, reviewed: boolean) => {
      const current = byLocaleRef.current[locale];
      if (!current) return;
      const others = current.reviewedQuestionIds.filter(
        (id) => id !== questionId
      );
      commit(locale, {
        ...current,
        reviewedQuestionIds: reviewed ? [...others, questionId] : others,
        updatedAt: Date.now(),
      });
      setDirty((d) => ({ ...d, [locale]: true }));
      setError(null);
      enqueueSave(locale).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Save failed');
      });
    },
    [commit, enqueueSave]
  );

  const save = useCallback(
    async (locale: string) => {
      if (!byLocaleRef.current[locale]) return;
      setLoading((l) => ({ ...l, [locale]: true }));
      setError(null);
      try {
        await enqueueSave(locale);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setLoading((l) => ({ ...l, [locale]: false }));
      }
    },
    [enqueueSave]
  );

  const saveAll = useCallback(async () => {
    const locales = Object.keys(dirty).filter((locale) => dirty[locale]);
    await Promise.all(locales.map((locale) => enqueueSave(locale)));
  }, [dirty, enqueueSave]);

  const hasUnsavedChanges = Object.values(dirty).some(Boolean);

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
    saveAll,
    hasUnsavedChanges,
    staleIds,
    cap,
    error,
    loadFailed,
    needsLoad,
  };
}
