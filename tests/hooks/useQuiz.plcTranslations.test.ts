/**
 * A peer pulling a synced quiz writes its OWN Drive sidecars from the group
 * doc's payload, then rebuilds the index (plan §11 PR5). Canonical review state
 * wins; a locale the puller alone has is left untouched.
 *
 * Mocking mirrors tests/hooks/useQuiz.translations.test.ts.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useQuiz } from '@/hooks/useQuiz';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import { hashQuestionForTranslation } from '@/utils/quizTranslationHash';
import type {
  QuizMetadata,
  QuizQuestion,
  QuizTranslation,
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

import { pullSyncedQuizContent } from '@/hooks/useSyncedQuizGroups';

const UID = 'teacher-uid-plc-tr';

const QUESTION: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Which is prime?',
  correctAnswer: 'Seven',
  incorrectAnswers: ['Eight'],
} as QuizQuestion;

const canonicalSidecar = (
  locale: string,
  hash: string,
  reviewed: string[]
): QuizTranslation => ({
  locale,
  title: `Números ${locale}`,
  questions: { q1: { text: '¿Cuál es primo?' } },
  sourceHashes: { q1: hash },
  reviewedQuestionIds: reviewed,
  model: 'm',
  generatedAt: 1,
  updatedAt: 9,
});

const localEntry = (
  driveFileId: string,
  hash: string
): QuizTranslationIndexEntry => ({
  driveFileId,
  reviewedCount: 0,
  staleCount: 0,
  questionCount: 1,
  sourceHashes: { q1: hash },
  updatedAt: 1,
});

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

let freshHash: string;

const syncedMeta = (
  translations?: Record<string, QuizTranslationIndexEntry>
): QuizMetadata =>
  ({
    id: 'quiz-plc-tr',
    title: 'Numbers',
    driveFileId: 'drive-file-plc',
    questionCount: 1,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    sync: { groupId: 'grp-1', lastSyncedVersion: 3 },
    ...(translations ? { translations } : {}),
  }) as QuizMetadata;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
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
    questions: [QUESTION],
    version: 5,
    translations: { es: canonicalSidecar('es', freshHash, ['q1']) },
  });
});

describe('pullSyncedQuiz — canonical translations', () => {
  it("writes the peer's own sidecar and indexes it", async () => {
    const payloads = captureSetDocPayloads();
    const { result } = renderHook(() => useQuiz(UID));
    let meta!: QuizMetadata;
    await act(async () => {
      meta = await result.current.pullSyncedQuiz(syncedMeta());
    });

    const entry = meta.translations?.es;
    expect(entry).toBeDefined();
    expect(entry?.reviewedCount).toBe(1);
    expect(entry?.staleCount).toBe(0);
    // The sidecar landed in this teacher's own Drive, under a local file id.
    const stored = localStorage.getItem(
      `mock_quiz_drive:${UID}:${entry?.driveFileId}`
    );
    expect((JSON.parse(stored ?? '{}') as QuizTranslation).title).toBe(
      'Números es'
    );
    expect(
      (payloads[0].translations as Record<string, QuizTranslationIndexEntry>).es
        .driveFileId
    ).toBe(entry?.driveFileId);
  });

  it('overwrites local review state with the canonical one', async () => {
    const { result } = renderHook(() => useQuiz(UID));
    let meta!: QuizMetadata;
    await act(async () => {
      // Local index claims zero reviewed; canonical says q1 is approved.
      meta = await result.current.pullSyncedQuiz(
        syncedMeta({ es: localEntry('local-es', 'older-hash') })
      );
    });
    expect(meta.translations?.es.reviewedCount).toBe(1);
    expect(meta.translations?.es.sourceHashes).toEqual({ q1: freshHash });
    // Reuses the existing sidecar file rather than orphaning it.
    expect(meta.translations?.es.driveFileId).toBe('local-es');
  });

  it('leaves a locale the canonical lacks untouched', async () => {
    const { result } = renderHook(() => useQuiz(UID));
    let meta!: QuizMetadata;
    await act(async () => {
      meta = await result.current.pullSyncedQuiz(
        syncedMeta({ so: localEntry('local-so', freshHash) })
      );
    });
    expect(meta.translations?.so.driveFileId).toBe('local-so');
    expect(meta.translations?.es).toBeDefined();
  });

  it('keeps the other locales when one sidecar write fails', async () => {
    (pullSyncedQuizContent as unknown as Mock).mockResolvedValue({
      title: 'Numbers',
      questions: [QUESTION],
      version: 5,
      translations: {
        es: canonicalSidecar('es', freshHash, ['q1']),
        so: canonicalSidecar('so', freshHash, ['q1']),
      },
    });
    vi.spyOn(
      MockQuizDriveService.prototype,
      'saveTranslation'
    ).mockImplementation((_id: string, _title: string, locale: string) =>
      locale === 'es'
        ? Promise.reject(new Error('Drive quota'))
        : Promise.resolve(`ok-${locale}`)
    );

    const { result } = renderHook(() => useQuiz(UID));
    let meta!: QuizMetadata;
    await act(async () => {
      meta = await result.current.pullSyncedQuiz(syncedMeta());
    });
    expect(meta.translations?.so.driveFileId).toBe('ok-so');
    expect(meta.translations?.es).toBeUndefined();
  });

  it('writes no translations key when the canonical carries none', async () => {
    (pullSyncedQuizContent as unknown as Mock).mockResolvedValue({
      title: 'Numbers',
      questions: [QUESTION],
      version: 5,
    });
    const payloads = captureSetDocPayloads();
    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.pullSyncedQuiz(syncedMeta());
    });
    expect(payloads[0]).not.toHaveProperty('translations');
  });
});
