import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import type {
  VideoActivityAssignmentSettings,
  VideoActivitySession,
  VideoActivitySessionOptions,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('./useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDocs = getDocs as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;

const TEACHER_UID = 'teacher-1';

const ACTIVITY = {
  id: 'activity-1',
  title: 'Why does the sun shine?',
  driveFileId: 'drive-1',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [],
};

function makeSessionOptions(
  overrides: Partial<VideoActivitySessionOptions> = {}
): VideoActivitySessionOptions {
  return {
    tabWarningsEnabled: true,
    showResultToStudent: true,
    showCorrectAnswerToStudent: true,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    attemptLimit: 2,
    rewindOnIncorrectSeconds: 30,
    pointPenaltyOnIncorrect: 1,
    scoreVisibility: 'score_and_responses',
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<VideoActivityAssignmentSettings> = {}
): VideoActivityAssignmentSettings {
  return {
    className: 'Period 1',
    sessionSettings: {
      autoPlay: true,
      requireCorrectAnswer: false,
      allowSkipping: false,
    },
    ...overrides,
  } as VideoActivityAssignmentSettings;
}

describe('useVideoActivityAssignments — createAssignment persists sessionOptions', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    batchSet.mockReset();
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('writes sessionOptions onto BOTH the assignment doc and the session doc', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const sessionOptions = makeSessionOptions();
    const settings = makeSettings({ sessionOptions });

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    expect(batchSet).toHaveBeenCalledTimes(2);

    // First batch.set is the assignment doc; second is the session doc.
    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const sessionPayload = batchSet.mock.calls[1][1] as VideoActivitySession;

    expect(assignmentPayload.sessionOptions).toEqual(sessionOptions);
    expect(sessionPayload.sessionOptions).toEqual(sessionOptions);
  });

  it('omits sessionOptions field entirely when not provided (legacy callers)', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const settings = makeSettings();

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    const sessionPayload = batchSet.mock.calls[1][1] as Record<string, unknown>;

    expect('sessionOptions' in assignmentPayload).toBe(false);
    expect('sessionOptions' in sessionPayload).toBe(false);
  });

  it('persists scoreVisibility and periodNames on the assignment when provided', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const settings = makeSettings({
      scoreVisibility: 'score_responses_and_answers',
      periodNames: ['Period 1', 'Period 2'],
    });

    await act(async () => {
      await result.current.createAssignment(ACTIVITY, settings);
    });

    const assignmentPayload = batchSet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(assignmentPayload.scoreVisibility).toBe(
      'score_responses_and_answers'
    );
    expect(assignmentPayload.periodNames).toEqual(['Period 1', 'Period 2']);
  });
});

describe('useVideoActivityAssignments — updateAssignmentSettings mirrors policy options to session', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: vi.fn(),
      update: batchUpdate,
      commit: batchCommit,
    });
  });

  it('mirrors a sessionOptions patch to the session doc', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );
    const sessionOptions = makeSessionOptions({ attemptLimit: 5 });

    await act(async () => {
      await result.current.updateAssignmentSettings('assignment-1', {
        sessionOptions,
      });
    });

    // Two updates: assignment doc + session doc.
    expect(batchUpdate).toHaveBeenCalledTimes(2);

    const sessionDocPath = batchUpdate.mock.calls[1][0] as string;
    const sessionPatch = batchUpdate.mock.calls[1][1] as Record<
      string,
      unknown
    >;
    expect(sessionDocPath).toContain('video_activity_sessions/assignment-1');
    expect(sessionPatch).toEqual({ sessionOptions });
  });

  it('does not touch the session doc when only assignment-only fields change', async () => {
    const { result } = renderHook(() =>
      useVideoActivityAssignments(TEACHER_UID)
    );

    await act(async () => {
      await result.current.updateAssignmentSettings('assignment-1', {
        className: 'Period 2 Renamed',
      });
    });

    // Only the assignment doc gets updated — no session-side update.
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });
});
