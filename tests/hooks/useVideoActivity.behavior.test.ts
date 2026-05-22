/**
 * Tests for saveActivity / pullSyncedVideoActivity behavior-field threading in useVideoActivity.
 *
 * Mocking strategy mirrors useQuiz.behavior.test.ts:
 *   - firebase/firestore is fully mocked (getDoc, setDoc, onSnapshot, etc.)
 *   - useSyncedVideoActivityGroups helpers (publishSyncedVideoActivity,
 *     pullSyncedVideoActivityContent) are module-mocked so we can assert
 *     what they receive.
 *   - GoogleDrive / useGoogleDrive is mocked via mockQuizDriveService
 *     (isAuthBypass path — returns a deterministic Drive mock).
 *   - useAuth provides a stable googleAccessToken (unused in bypass mode).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import type {
  VideoActivityBehaviorSettings,
  VideoActivityData,
  VideoActivityMetadata,
} from '@/types';

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

// Mock publishSyncedVideoActivity and pullSyncedVideoActivityContent so we can spy on args
vi.mock('@/hooks/useSyncedVideoActivityGroups', async (importActual) => {
  const actual =
    await importActual<typeof import('@/hooks/useSyncedVideoActivityGroups')>();
  return {
    ...actual,
    publishSyncedVideoActivity: vi.fn(),
    pullSyncedVideoActivityContent: vi.fn(),
    SyncedVideoActivityVersionConflictError:
      actual.SyncedVideoActivityVersionConflictError,
  };
});

// MockQuizDriveService lives in utils/ — let it through but spy on saveQuiz
vi.mock('@/utils/mockQuizDriveService', async (importActual) => {
  const actual =
    await importActual<typeof import('@/utils/mockQuizDriveService')>();
  return actual; // real implementation — it writes to an in-memory store
});

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

vi.mock('@/components/common/library/libraryDuplicate', () => ({
  suggestDuplicateTitle: vi.fn((t: string) => `${t} (Copy)`),
}));

vi.mock('@/utils/videoActivityNormalize', () => ({
  normalizeVideoActivityQuestions: vi.fn((qs: unknown) => qs),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are hoisted
// ---------------------------------------------------------------------------

import {
  publishSyncedVideoActivity,
  pullSyncedVideoActivityContent,
} from '@/hooks/useSyncedVideoActivityGroups';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const UID = 'teacher-uid-va-test';

const BEHAVIOR: VideoActivityBehaviorSettings = {
  sessionMode: 'auto',
  sessionOptions: {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: true,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    rewindOnIncorrectSeconds: 0,
    pointPenaltyOnIncorrect: 0,
    scoreVisibility: 'score-only',
  },
  attemptLimit: 2,
};

const OTHER_BEHAVIOR: VideoActivityBehaviorSettings = {
  sessionMode: 'student',
  sessionOptions: {
    tabWarningsEnabled: false,
    showResultToStudent: true,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: true,
    shuffleQuestions: true,
    shuffleAnswerOptions: false,
    rewindOnIncorrectSeconds: 5,
    pointPenaltyOnIncorrect: 0,
    scoreVisibility: 'score-only',
  },
  attemptLimit: 1,
};

const ACTIVITY_DATA: VideoActivityData = {
  id: 'va-001',
  title: 'Behavior Video Activity',
  youtubeUrl: 'https://www.youtube.com/watch?v=test',
  questions: [{ id: 'q1', type: 'timed', text: 'Q1?' } as never],
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const ACTIVITY_META: VideoActivityMetadata = {
  id: ACTIVITY_DATA.id,
  title: ACTIVITY_DATA.title,
  youtubeUrl: ACTIVITY_DATA.youtubeUrl,
  driveFileId: 'drive-va-file-001',
  questionCount: 1,
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

const SYNCED_ACTIVITY_META: VideoActivityMetadata = {
  ...ACTIVITY_META,
  sync: { groupId: 'va-grp-abc', lastSyncedVersion: 3 },
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

  // getDoc: no existing doc by default (new activity)
  (firestore.getDoc as unknown as Mock).mockResolvedValue({
    exists: () => false,
    data: () => null,
  });

  // publishSyncedVideoActivity resolves with version 4 by default
  (publishSyncedVideoActivity as unknown as Mock).mockResolvedValue({
    version: 4,
  });

  // pullSyncedVideoActivityContent returns canonical data by default
  (pullSyncedVideoActivityContent as unknown as Mock).mockResolvedValue({
    title: 'Canonical Title',
    youtubeUrl: 'https://www.youtube.com/watch?v=canonical',
    questions: ACTIVITY_DATA.questions,
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
// (a) saveActivity with explicit behavior writes it to the metadata doc
// ---------------------------------------------------------------------------

describe('saveActivity — behavior on metadata write', () => {
  it('writes behavior to metadata doc when saveActivity is called with behavior', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(ACTIVITY_DATA, undefined, BEHAVIOR);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });

  it('does NOT write behavior key when saveActivity is called without it and no existing meta', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(ACTIVITY_DATA, undefined);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('behavior');
  });
});

// ---------------------------------------------------------------------------
// (b) saveActivity forwards behavior to publishSyncedVideoActivity when activity is synced
// ---------------------------------------------------------------------------

describe('saveActivity — forwards behavior to publishSyncedVideoActivity', () => {
  beforeEach(() => {
    // Existing meta has sync linkage
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => SYNCED_ACTIVITY_META,
    });
  });

  it('passes behavior to publishSyncedVideoActivity when provided', async () => {
    captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(
        ACTIVITY_DATA,
        'drive-va-file-001',
        BEHAVIOR
      );
    });

    expect(publishSyncedVideoActivity).toHaveBeenCalledTimes(1);
    const [, input] = (publishSyncedVideoActivity as unknown as Mock).mock
      .calls[0] as [
      string,
      import('@/hooks/useSyncedVideoActivityGroups').PublishSyncedVideoActivityInput,
    ];
    expect(input.behavior).toEqual(BEHAVIOR);
  });

  it('omits behavior from publishSyncedVideoActivity when not provided and existing meta has no behavior', async () => {
    captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(ACTIVITY_DATA, 'drive-va-file-001');
    });

    expect(publishSyncedVideoActivity).toHaveBeenCalledTimes(1);
    const [, input] = (publishSyncedVideoActivity as unknown as Mock).mock
      .calls[0] as [
      string,
      import('@/hooks/useSyncedVideoActivityGroups').PublishSyncedVideoActivityInput,
    ];
    expect(input).not.toHaveProperty('behavior');
  });
});

// ---------------------------------------------------------------------------
// (c) preserve-on-omit: existing meta behavior is preserved when saveActivity
//     is called without a behavior argument
// ---------------------------------------------------------------------------

describe('saveActivity — preserve-on-omit semantics', () => {
  it('preserves existing meta behavior on write when saveActivity is called without behavior', async () => {
    // Existing meta already has behavior
    const existingMeta: VideoActivityMetadata = {
      ...ACTIVITY_META,
      behavior: OTHER_BEHAVIOR,
    };
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => existingMeta,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(ACTIVITY_DATA, 'drive-va-file-001');
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: OTHER_BEHAVIOR });
  });

  it('uses the passed behavior (not existing meta) when saveActivity is called WITH behavior', async () => {
    const existingMeta: VideoActivityMetadata = {
      ...ACTIVITY_META,
      behavior: OTHER_BEHAVIOR,
    };
    (firestore.getDoc as unknown as Mock).mockResolvedValue({
      exists: () => true,
      data: () => existingMeta,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.saveActivity(
        ACTIVITY_DATA,
        'drive-va-file-001',
        BEHAVIOR
      );
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });
});

// ---------------------------------------------------------------------------
// (d) pullSyncedVideoActivity writes pulled behavior to the local metadata doc
// ---------------------------------------------------------------------------

describe('pullSyncedVideoActivity — applies pulled behavior to metadata', () => {
  it('writes behavior from canonical doc into the local metadata', async () => {
    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.pullSyncedVideoActivity(SYNCED_ACTIVITY_META);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ behavior: BEHAVIOR });
  });

  it('does not write behavior key when canonical doc has no behavior', async () => {
    (pullSyncedVideoActivityContent as unknown as Mock).mockResolvedValue({
      title: 'Canonical Title',
      youtubeUrl: 'https://www.youtube.com/watch?v=canonical',
      questions: ACTIVITY_DATA.questions,
      // no behavior
      version: 5,
    });

    const payloads = captureSetDocPayloads();

    const { result } = renderHook(() => useVideoActivity(UID));
    await act(async () => {
      await result.current.pullSyncedVideoActivity(SYNCED_ACTIVITY_META);
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('behavior');
  });
});
