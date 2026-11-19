// Assign-time translation: makes each language a targeted student needs ready to serve, with no teacher step.
import type {
  QuestionTranslation,
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import { isTranslatableQuestionType } from '@/config/quizTranslation';
import { hashQuestionForTranslation } from './quizTranslationHash';
import { buildTranslationIndexEntry } from './quizTranslationIndex';
import { isLocaleCovered } from './quizTranslationAdvisory';

export interface AutoTranslateQuiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export interface AutoTranslateResult {
  title?: string;
  questions: Record<string, QuestionTranslation>;
  sourceHashes: Record<string, string>;
  model: string;
}

export interface AutoTranslateDeps {
  loadTranslation(fileId: string): Promise<QuizTranslation>;
  saveTranslation(
    locale: string,
    payload: QuizTranslation,
    existingFileId?: string
  ): Promise<string>;
  /** Calls `translateQuizV1`; no ids means the whole quiz, with its full budget and title. */
  translate(
    locale: string,
    questionIds?: string[]
  ): Promise<AutoTranslateResult>;
  deleteTranslation(fileId: string): Promise<void>;
  writeIndex(locale: string, entry: QuizTranslationIndexEntry): Promise<void>;
  now?: () => number;
}

/** One language: translates what's missing or out of date, approves it, saves it to Drive and the index. */
export async function autoTranslateLocale(
  quiz: AutoTranslateQuiz,
  locale: string,
  existing: QuizTranslationIndexEntry | undefined,
  deps: AutoTranslateDeps
): Promise<QuizTranslationIndexEntry> {
  const translatable = quiz.questions.filter((q) =>
    isTranslatableQuestionType(q.type)
  );
  const liveHashes = new Map<string, string>();
  for (const q of translatable)
    liveHashes.set(q.id, await hashQuestionForTranslation(q));
  const previous = existing?.driveFileId
    ? await deps.loadTranslation(existing.driveFileId)
    : undefined;
  const isFresh = (t: QuizTranslation | undefined, id: string) =>
    !!t?.questions[id] && t.sourceHashes?.[id] === liveHashes.get(id);
  const needed = translatable
    .filter((q) => !isFresh(previous, q.id))
    .map((q) => q.id);
  const result =
    needed.length === 0
      ? undefined
      : await deps.translate(
          locale,
          needed.length === translatable.length ? undefined : needed
        );
  const now = deps.now?.() ?? Date.now();
  const merged: QuizTranslation = {
    locale,
    title: result?.title ?? previous?.title ?? quiz.title,
    questions: { ...(previous?.questions ?? {}), ...(result?.questions ?? {}) },
    sourceHashes: {
      ...(previous?.sourceHashes ?? {}),
      ...(result?.sourceHashes ?? {}),
    },
    reviewedQuestionIds: [],
    model: result?.model ?? previous?.model ?? '',
    generatedAt: previous?.generatedAt ?? now,
    updatedAt: now,
  };
  // Every fresh question serves; a teacher can still edit it in the Languages tab.
  merged.reviewedQuestionIds = translatable
    .filter((q) => isFresh(merged, q.id))
    .map((q) => q.id);
  const fileId = await deps.saveTranslation(
    locale,
    merged,
    existing?.driveFileId
  );
  const entry = await buildTranslationIndexEntry(
    fileId,
    merged,
    quiz.questions
  );
  try {
    await deps.writeIndex(locale, entry);
  } catch (err) {
    // A new file the index never recorded would sit in Drive unused.
    if (!existing?.driveFileId)
      await deps.deleteTranslation(fileId).catch(() => undefined);
    throw err;
  }
  return entry;
}

/** Every targeted language the index can't serve yet, translated in parallel; a failure keeps English. */
export async function autoTranslateForAssign(
  quiz: AutoTranslateQuiz,
  index: Record<string, QuizTranslationIndexEntry> | undefined,
  locales: string[],
  deps: AutoTranslateDeps,
  onError?: (locale: string, err: unknown) => void
): Promise<Record<string, QuizTranslationIndexEntry> | undefined> {
  const missing = locales.filter(
    (locale) => !isLocaleCovered(locale, { index })
  );
  if (missing.length === 0) return index;
  const results = await Promise.allSettled(
    missing.map((locale) =>
      autoTranslateLocale(quiz, locale, index?.[locale], deps)
    )
  );
  const next = { ...(index ?? {}) };
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') next[missing[i]] = result.value;
    else onError?.(missing[i], result.reason);
  });
  return Object.keys(next).length > 0 ? next : undefined;
}
