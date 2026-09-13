/**
 * `QuizMetadata.translations` survives all four metadata write sites and
 * `staleCount` is recomputed from the in-memory quiz body (plan §3.3, §9, D31).
 * Mocking mirrors useQuiz.behavior.test.ts.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useQuiz } from '@/hooks/useQuiz';
import { hashQuestionForTranslation } from '@/utils/quizTranslationHash';
import type {
  QuizData,
  QuizMetadata,
  QuizQuestion,
  QuizTranslationIndexEntry,
} from '@/types';

vi.mock('firebase/firestore');

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: true,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({ googleAccessToken: null })),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(() => ({ isConnected: false })),
}));

vi.mock('@/hooks/useSyncedQuizGroups', async (importActual) => {
  const actual =
    await importActual<typeof import('@/hooks/useSyncedQuizGroups')>();
  return {
    ...actual,
    publishSyncedQuiz: vi.fn(),
    pullSyncedQuizContent: vi.fn(),
    callLeaveSyncedQuizGroup: vi.fn(),
  };
});

vi.mock('@/utils/quizSyncMigration', () => ({
  migrateQuizMetadataShape: vi.fn((data: unknown) => data),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/components/common/library/libraryDuplicate', () => ({
  suggestDuplicateTitle: vi.fn((t: string) => `${t} (Copy)`),
}));

import {
  pullSyncedQuizContent,
  callLeaveSyncedQuizGroup,
} from '@/hooks/useSyncedQuizGroups';

const UID = 'teacher-uid-translations';

const QUESTION: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Which is prime?',
  correctAnswer: 'Seven',
  incorrectAnswers: ['Eight'],
} as QuizQuestion;

const QUIZ_DATA: QuizData = {
  id: 'quiz-tr-001',
  title: 'Numbers',
  questions: [QUESTION],
  language: 'en-US',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const entry = (
  sourceHashes: Record<string, string>
): QuizTranslationIndexEntry => ({
  driveFileId: 'drive-tr-es',
  reviewedCount: 1,
  staleCount: 0,
  questionCount: 1,
  sourceHashes,
  updatedAt: 5,
});

const metaWith = (
  sourceHashes: Record<string, string>,
  extra: Partial<QuizMetadata> = {}
): QuizMetadata =>
  ({
    id: QUIZ_DATA.id,
    title: QUIZ_DATA.title,
    driveFileId: 'drive-file-tr',
    questionCount: 1,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    translations: { es: entry(sourceHashes) },
    language: 'en-US',
    ...extra,
  }) as QuizMetadata;

function captureSetDocPayloads(): Array<Record<string, unknown>> {
  const payloads: Array<Record<string, unknown>> = [];
  (firestore.setDoc as unknown as Mock).mockImplementation(
    (_ref: unknown, payload: Record<string, unknown>) => {
      payloads.push(payload);
      return Promise.resolve();
    }
  );
  return payloads;
}

const translationsOf = (payload: Record<string, unknown>) =>
  payload.translations as Record<string, QuizTranslationIndexEntry> | undefined;

let freshHash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  freshHash = await hashQuestionForTranslation(QUESTION);

  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => ({ __ref: segs.join('/') })
  );
  (firestore.collection as unknown as Mock).mockReturnValue({});
  (firestore.query as unknown as Mock).mockReturnValue({});
  (firestore.orderBy as unknown as Mock).mockReturnValue({});
  (firestore.onSnapshot as unknown as Mock).mockImplementation(() => vi.fn());
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);
  (firestore.getDoc as unknown as Mock).mockResolvedValue({
    exists: () => false,
    data: () => null,
  });
  (pullSyncedQuizContent as unknown as Mock).mockResolvedValue({
    title: 'Numbers',
    questions: QUIZ_DATA.questions,
    language: 'en-US',
    version: 5,
  });
  (callLeaveSyncedQuizGroup as unknown as Mock).mockResolvedValue(undefined);
});

describe('saveQuiz — translation index preservation', () => {
  it('carries the seeded entry forward and writes language', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => metaWith({ q1: freshHash }),
    });
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-tr');
    });

    expect(translationsOf(payloads[0])?.es).toMatchObject({
      driveFileId: 'drive-tr-es',
      reviewedCount: 1,
      staleCount: 0,
      questionCount: 1,
    });
    expect(payloads[0].language).toBe('en-US');
  });

  it('recomputes staleCount when the question body has changed', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => metaWith({ q1: 'hash-from-an-older-body' }),
    });
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-tr');
    });

    expect(translationsOf(payloads[0])?.es.staleCount).toBe(1);
    // The sidecar's hashes are carried verbatim — a save never rewrites Drive.
    expect(translationsOf(payloads[0])?.es.sourceHashes).toEqual({
      q1: 'hash-from-an-older-body',
    });
  });

  it('never writes an empty translations key on a quiz with none', async () => {
    const payloads = captureSetDocPayloads();
    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA);
    });
    expect(payloads[0]).not.toHaveProperty('translations');
  });
});

describe('pullSyncedQuiz — translation index preservation', () => {
  it("recomputes staleCount against the peer's canonical body", async () => {
    const payloads = captureSetDocPayloads();
    const syncedMeta = metaWith(
      { q1: 'hash-from-an-older-body' },
      { sync: { groupId: 'grp-1', lastSyncedVersion: 3 } }
    );

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.pullSyncedQuiz(syncedMeta);
    });

    expect(translationsOf(payloads[0])?.es.staleCount).toBe(1);
    expect(payloads[0].language).toBe('en-US');
  });
});

describe('detachSyncedQuiz — translation index preservation', () => {
  it('carries the index and language through the detach write', async () => {
    const payloads = captureSetDocPayloads();
    const syncedMeta = metaWith(
      { q1: freshHash },
      { sync: { groupId: 'grp-1', lastSyncedVersion: 3 } }
    );

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.detachSyncedQuiz(syncedMeta);
    });

    expect(translationsOf(payloads[0])?.es.driveFileId).toBe('drive-tr-es');
    expect(payloads[0].language).toBe('en-US');
    expect(payloads[0]).not.toHaveProperty('sync');
  });
});

describe('duplicateQuiz — sidecars copied, index rebuilt', () => {
  it('points the copy at a NEW sidecar file id', async () => {
    const { result } = renderHook(() => useQuiz(UID));

    let saved!: QuizMetadata;
    await act(async () => {
      saved = await result.current.saveQuiz(QUIZ_DATA);
    });

    // Seed the mock Drive store with a sidecar the duplicate can copy.
    const sidecar = {
      locale: 'es',
      title: 'Números',
      questions: { q1: { text: '¿Cuál es primo?' } },
      sourceHashes: { q1: freshHash },
      reviewedQuestionIds: ['q1'],
      model: 'm',
      generatedAt: 1,
      updatedAt: 1,
    };
    localStorage.setItem(
      `mock_quiz_drive:${UID}:seed-es`,
      JSON.stringify(sidecar)
    );

    const sourceMeta: QuizMetadata = {
      ...saved,
      translations: {
        es: {
          driveFileId: 'seed-es',
          reviewedCount: 1,
          staleCount: 0,
          questionCount: 1,
          sourceHashes: { q1: freshHash },
          updatedAt: 1,
        },
      },
    };

    const payloads = captureSetDocPayloads();
    let duplicated!: QuizMetadata;
    await act(async () => {
      duplicated = await result.current.duplicateQuiz(sourceMeta);
    });

    expect(duplicated.translations?.es.driveFileId).not.toBe('seed-es');
    expect(duplicated.translations?.es.reviewedCount).toBe(1);
    expect(translationsOf(payloads[payloads.length - 1])?.es).toBeDefined();
  });

  it('carries the readable locale when one sidecar is missing', async () => {
    const { result } = renderHook(() => useQuiz(UID));
    let saved!: QuizMetadata;
    await act(async () => {
      saved = await result.current.saveQuiz(QUIZ_DATA);
    });
    localStorage.setItem(
      `mock_quiz_drive:${UID}:seed-so`,
      JSON.stringify({
        locale: 'so',
        title: 'Su’aalo',
        questions: { q1: { text: 'Kee?' } },
        sourceHashes: { q1: freshHash },
        reviewedQuestionIds: [],
        model: 'm',
        generatedAt: 1,
        updatedAt: 1,
      })
    );
    const entry = (driveFileId: string) => ({
      driveFileId,
      reviewedCount: 0,
      staleCount: 0,
      questionCount: 1,
      sourceHashes: { q1: freshHash },
      updatedAt: 1,
    });
    const sourceMeta: QuizMetadata = {
      ...saved,
      // `missing-es` was never seeded, so loading it rejects.
      translations: { es: entry('missing-es'), so: entry('seed-so') },
    };

    let duplicated!: QuizMetadata;
    await act(async () => {
      duplicated = await result.current.duplicateQuiz(sourceMeta);
    });

    expect(duplicated.translations?.es).toBeUndefined();
    expect(duplicated.translations?.so.driveFileId).not.toBe('seed-so');
  });

  it('writes no translations key when the source has none', async () => {
    const { result } = renderHook(() => useQuiz(UID));
    let saved!: QuizMetadata;
    await act(async () => {
      saved = await result.current.saveQuiz(QUIZ_DATA);
    });
    const payloads = captureSetDocPayloads();
    await act(async () => {
      await result.current.duplicateQuiz(saved);
    });
    expect(payloads[payloads.length - 1]).not.toHaveProperty('translations');
  });
});
