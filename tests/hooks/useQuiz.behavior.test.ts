/**
 * Tests for saveQuiz / pullSyncedQuiz behavior-field threading in useQuiz.
 *
 * Mocking strategy:
 *   - firebase/firestore is fully mocked (getDoc, setDoc, onSnapshot, etc.)
 *   - useSyncedQuizGroups helpers (publishSyncedQuiz, pullSyncedQuizContent)
 *     are module-mocked so we can assert what they receive.
 *   - GoogleDrive / useGoogleDrive is mocked via mockQuizDriveService
 *     (isAuthBypass path — returns a deterministic Drive mock).
 *   - useAuth provides a stable googleAccessToken (unused in bypass mode).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useQuiz } from '@/hooks/useQuiz';
import type { QuizBehaviorSettings, QuizData, QuizMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

// Mock publishSyncedQuiz and pullSyncedQuizContent so we can spy on args
vi.mock('@/hooks/useSyncedQuizGroups', async (importActual) => {
  const actual =
    await importActual<typeof import('@/hooks/useSyncedQuizGroups')>();
  return {
    ...actual,
    publishSyncedQuiz: vi.fn(),
    pullSyncedQuizContent: vi.fn(),
    callLeaveSyncedQuizGroup: vi.fn(),
    SyncedQuizVersionConflictError: actual.SyncedQuizVersionConflictError,
  };
});

// MockQuizDriveService lives in utils/ — let it through but spy on saveQuiz
vi.mock('@/utils/mockQuizDriveService', async (importActual) => {
  const actual =
    await importActual<typeof import('@/utils/mockQuizDriveService')>();
  return actual; // real implementation — it writes to an in-memory store
});

vi.mock('@/utils/quizSyncMigration', () => ({
  migrateQuizMetadataShape: vi.fn((data: unknown) => data),
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

vi.mock('@/components/common/library/libraryDuplicate', () => ({
  suggestDuplicateTitle: vi.fn((t: string) => `${t} (Copy)`),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are hoisted
// ---------------------------------------------------------------------------

import {
  publishSyncedQuiz,
  pullSyncedQuizContent,
} from '@/hooks/useSyncedQuizGroups';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const UID = 'teacher-uid-test';

const BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'auto',
  sessionOptions: {
    showCorrectAnswerToStudent: true,
    speedBonusEnabled: false,
  },
  attemptLimit: 2,
};

const OTHER_BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'student',
  sessionOptions: {
    tabWarningsEnabled: true,
  },
  attemptLimit: 1,
};

const QUIZ_DATA: QuizData = {
  id: 'quiz-001',
  title: 'Behavior Quiz',
  questions: [{ id: 'q1', type: 'multiple-choice', text: 'Q1?' } as never],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const QUIZ_META: QuizMetadata = {
  id: QUIZ_DATA.id,
  title: QUIZ_DATA.title,
  driveFileId: 'drive-file-001',
  questionCount: 1,
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const SYNCED_QUIZ_META: QuizMetadata = {
  ...QUIZ_META,
  sync: { groupId: 'grp-abc', lastSyncedVersion: 3 },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // doc() returns a stable string ref
  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => ({ __ref: segs.join('/') })
  );

  // collection + query + orderBy + onSnapshot — needed for hook mount
  (firestore.collection as unknown as Mock).mockReturnValue({});
  (firestore.query as unknown as Mock).mockReturnValue({});
  (firestore.orderBy as unknown as Mock).mockReturnValue({});
  (firestore.onSnapshot as unknown as Mock).mockImplementation(() => vi.fn());

  // setDoc resolves by default
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);

  // getDoc: no existing doc by default (new quiz)
  (firestore.getDoc as unknown as Mock).mockResolvedValue({
    exists: () => false,
    data: () => null,
  });

  // publishSyncedQuiz resolves with version 4 by default
  (publishSyncedQuiz as unknown as Mock).mockResolvedValue({ version: 4 });

  // pullSyncedQuizContent returns canonical data by default
  (pullSyncedQuizContent as unknown as Mock).mockResolvedValue({
    title: 'Canonical Title',
    questions: QUIZ_DATA.questions,
    behavior: BEHAVIOR,
    version: 5,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// (a) saveQuiz with explicit behavior writes it to the metadata doc
// ---------------------------------------------------------------------------

describe('saveQuiz — behavior on metadata write', () => {
  it('writes behavior to metadata doc when saveQuiz is called with behavior', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, undefined, BEHAVIOR);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });

  it('does NOT write behavior key when saveQuiz is called without it and no existing meta', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, undefined);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('behavior');
  });
});

// ---------------------------------------------------------------------------
// (b) saveQuiz forwards behavior to publishSyncedQuiz when quiz is synced
// ---------------------------------------------------------------------------

describe('saveQuiz — forwards behavior to publishSyncedQuiz', () => {
  beforeEach(() => {
    // Existing meta has sync linkage
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => SYNCED_QUIZ_META,
    });
  });

  it('passes behavior to publishSyncedQuiz when provided', async () => {
    captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-001', BEHAVIOR);
    });

    expect(publishSyncedQuiz).toHaveBeenCalledTimes(1);
    const [, input] = (publishSyncedQuiz as unknown as Mock).mock.calls[0] as [
      string,
      import('@/hooks/useSyncedQuizGroups').PublishSyncedQuizInput,
    ];
    expect(input.behavior).toEqual(BEHAVIOR);
  });

  it('omits behavior from publishSyncedQuiz when not provided and existing meta has no behavior', async () => {
    captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-001');
    });

    expect(publishSyncedQuiz).toHaveBeenCalledTimes(1);
    const [, input] = (publishSyncedQuiz as unknown as Mock).mock.calls[0] as [
      string,
      import('@/hooks/useSyncedQuizGroups').PublishSyncedQuizInput,
    ];
    expect(input).not.toHaveProperty('behavior');
  });
});

// ---------------------------------------------------------------------------
// (c) preserve-on-omit: existing meta behavior is preserved when saveQuiz
//     is called without a behavior argument
// ---------------------------------------------------------------------------

describe('saveQuiz — preserve-on-omit semantics', () => {
  it('preserves existing meta behavior on write when saveQuiz is called without behavior', async () => {
    // Existing meta already has behavior
    const existingMeta: QuizMetadata = {
      ...QUIZ_META,
      behavior: OTHER_BEHAVIOR,
    };
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => existingMeta,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-001');
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: OTHER_BEHAVIOR });
  });

  it('uses the passed behavior (not existing meta) when saveQuiz is called WITH behavior', async () => {
    const existingMeta: QuizMetadata = {
      ...QUIZ_META,
      behavior: OTHER_BEHAVIOR,
    };
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => existingMeta,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.saveQuiz(QUIZ_DATA, 'drive-file-001', BEHAVIOR);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });
});

// ---------------------------------------------------------------------------
// (d) pullSyncedQuiz writes pulled behavior to the local metadata doc
// ---------------------------------------------------------------------------

describe('pullSyncedQuiz — applies pulled behavior to metadata', () => {
  it('writes behavior from canonical doc into the local metadata', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.pullSyncedQuiz(SYNCED_QUIZ_META);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });

  it('does not write behavior key when canonical doc has no behavior', async () => {
    (pullSyncedQuizContent as unknown as Mock).mockResolvedValue({
      title: 'Canonical Title',
      questions: QUIZ_DATA.questions,
      // no behavior
      version: 5,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useQuiz(UID));
    await act(async () => {
      await result.current.pullSyncedQuiz(SYNCED_QUIZ_META);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('behavior');
  });
});
